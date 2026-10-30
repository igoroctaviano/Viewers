import i18n from '@ohif/i18n';
import { utils } from '@ohif/core';

import {
  CheckedDataSource,
  StudyAvailability,
  checkStudyAvailability,
  describeError,
  isReferencedSeriesMissing,
} from './studyAvailability';

export type DataAvailabilityConfig = {
  enabled?: boolean;
};

const DICOMWEB_NAMESPACE = /dataSourcesModule\.dicomweb$/;

/**
 * Google Cloud Healthcare API stores are diagnosed and reported by the GCP
 * extension, which can tell the user why a store could not be read.
 */
const GCP_HEALTHCARE_HOST = 'healthcare.googleapis.com';

let displaySetsSubscription: { unsubscribe: () => void } | null = null;

/** Reads the study UIDs from the URL the same way the DICOMweb data source does. */
function getStudyInstanceUIDsFromQuery(): string[] {
  const query = new URLSearchParams(window.location.search);
  return utils.splitComma(
    query.getAll('StudyInstanceUIDs').concat(query.getAll('studyInstanceUIDs'))
  );
}

/**
 * Builds a label users can act on. Stores configured at runtime (for example
 * from the ?gcp= query param) are named by their DICOM store, not by the
 * generic friendly name of the data source.
 */
function getDataSourceLabel(sourceName: string, definition, dataSource): string {
  const qidoRoot: string | undefined = dataSource.getConfig?.()?.qidoRoot;
  const store = qidoRoot?.match(/\/dicomStores\/([^/]+)/)?.[1];
  if (store) {
    return i18n.t('DataAvailability:GCP DICOM store {{store}}', { store });
  }
  return definition?.friendlyName || definition?.configuration?.friendlyName || sourceName;
}

/**
 * Returns the DICOMweb data sources behind the active data source: each member
 * of a merge data source, or the active data source itself. Sources without a
 * QIDO root (for example `gcp` without a valid ?gcp= param) are skipped.
 */
function getDataSourcesToCheck(extensionManager): CheckedDataSource[] {
  const activeDefinition = extensionManager.getActiveDataSourceDefinition();
  if (!activeDefinition) {
    return [];
  }

  const sourceNames: string[] = activeDefinition.configuration?.seriesMerge?.dataSourceNames ?? [
    activeDefinition.sourceName,
  ];

  return sourceNames
    .map(sourceName => {
      const definition = extensionManager.getDataSourceDefinition(sourceName);
      const dataSource = extensionManager.getDataSources(sourceName)?.[0];
      if (!DICOMWEB_NAMESPACE.test(definition?.namespace ?? '') || !dataSource?.query?.series) {
        return null;
      }
      const qidoRoot: string | undefined = dataSource.getConfig?.()?.qidoRoot;
      if (!qidoRoot) {
        return null;
      }
      return {
        sourceName,
        label: getDataSourceLabel(sourceName, definition, dataSource),
        dataSource,
        reportsOwnErrors: qidoRoot.includes(GCP_HEALTHCARE_HOST),
      };
    })
    .filter(Boolean);
}

/**
 * Notifies about stores that could not be queried or hold no data for the
 * study. When no store has the study, OHIF already routes to its "study not
 * found" page, so only failed queries are reported in that case. GCP stores
 * are left to the GCP extension.
 */
function notifyStudyAvailability(
  { StudyInstanceUID, sources }: StudyAvailability,
  uiNotificationService
) {
  const reported = sources.filter(source => !source.reportsOwnErrors);
  const failed = reported.filter(source => source.status === 'failed');
  const empty = reported.filter(source => source.status === 'empty');
  const found = sources.filter(source => source.status === 'found');

  failed.forEach(source => {
    console.warn(
      `[IDC] Could not query ${source.label} for study ${StudyInstanceUID}:`,
      source.error
    );
    uiNotificationService.show({
      id: `idc-data-availability-failed-${source.sourceName}-${StudyInstanceUID}`,
      title: i18n.t('DataAvailability:Data source unavailable'),
      message: i18n.t(
        'DataAvailability:Could not query {{source}} for study {{studyInstanceUID}} ({{reason}}).',
        {
          source: source.label,
          studyInstanceUID: StudyInstanceUID,
          reason: describeError(source.error),
        }
      ),
      type: 'error',
      duration: Infinity,
    });
  });

  if (!found.length) {
    return;
  }

  empty.forEach(source => {
    console.warn(`[IDC] Study ${StudyInstanceUID} was not found in ${source.label}`);
    uiNotificationService.show({
      id: `idc-data-availability-empty-${source.sourceName}-${StudyInstanceUID}`,
      title: i18n.t('DataAvailability:Study not found in data source'),
      message: i18n.t(
        'DataAvailability:Study {{studyInstanceUID}} was not found in {{source}}. Showing data from {{others}} only.',
        {
          studyInstanceUID: StudyInstanceUID,
          source: source.label,
          others: found.map(other => other.label).join(', '),
        }
      ),
      type: 'warning',
      duration: 10000,
    });
  });
}

function notifyMissingReferencedSeries(
  displaySet,
  availability: StudyAvailability,
  uiNotificationService
) {
  if (!isReferencedSeriesMissing(displaySet, availability)) {
    return;
  }

  const searched = availability.sources
    .filter(source => source.status !== 'failed')
    .map(source => source.label)
    .join(', ');
  const unchecked = availability.sources
    .filter(source => source.status === 'failed')
    .map(source => source.label)
    .join(', ');
  const label = displaySet.label || displaySet.SeriesDescription || displaySet.Modality;
  const message = i18n.t(
    'DataAvailability:{{label}} ({{modality}}) references series {{seriesInstanceUID}}, which was not found in {{sources}}. It cannot be displayed over its source images.',
    {
      label,
      modality: displaySet.Modality,
      seriesInstanceUID: displaySet.referencedSeriesInstanceUID,
      sources: searched,
    }
  );

  console.warn(
    `[IDC] ${displaySet.Modality} ${displaySet.SeriesInstanceUID} references series ` +
      `${displaySet.referencedSeriesInstanceUID}, which was not found in ${searched}`
  );
  uiNotificationService.show({
    id: `idc-data-availability-reference-${displaySet.SeriesInstanceUID}`,
    title: i18n.t('DataAvailability:Referenced series not found'),
    message: unchecked
      ? `${message} ${i18n.t('DataAvailability:{{sources}} could not be checked and may hold it.', {
          sources: unchecked,
        })}`
      : message,
    type: 'warning',
    duration: Infinity,
  });
}

/**
 * Tells the user when the data they asked for is missing from a store:
 *   1. A data source (the main store or one added by ?gcp=) fails to answer
 *      or has no series for the requested study.
 *   2. A SEG, RTSTRUCT or other derived series references a series that none
 *      of the data sources hold, so it has no images to be displayed over.
 *
 * Safe to call on every `onModeEnter`; the previous subscription is torn down.
 */
export function registerDataAvailabilityChecks({
  servicesManager,
  extensionManager,
  config,
}: {
  servicesManager: AppTypes.ServicesManager;
  extensionManager;
  config?: DataAvailabilityConfig;
}): void {
  displaySetsSubscription?.unsubscribe();
  displaySetsSubscription = null;

  if (config?.enabled === false) {
    return;
  }

  const { displaySetService, uiNotificationService } = servicesManager.services;
  const dataSources = getDataSourcesToCheck(extensionManager);
  const studyInstanceUIDs = getStudyInstanceUIDsFromQuery();
  if (!dataSources.length || !studyInstanceUIDs.length) {
    return;
  }

  const availabilityByStudy = new Map<string, Promise<StudyAvailability>>(
    studyInstanceUIDs.map(StudyInstanceUID => [
      StudyInstanceUID,
      checkStudyAvailability(StudyInstanceUID, dataSources),
    ])
  );

  availabilityByStudy.forEach(promise =>
    promise.then(availability => notifyStudyAvailability(availability, uiNotificationService))
  );

  const checkDisplaySet = displaySet => {
    const availability = availabilityByStudy.get(displaySet?.StudyInstanceUID);
    if (!availability || !displaySet.referencedSeriesInstanceUID) {
      return;
    }
    availability.then(result =>
      notifyMissingReferencedSeries(displaySet, result, uiNotificationService)
    );
  };

  displaySetService.getActiveDisplaySets?.().forEach(checkDisplaySet);

  displaySetsSubscription = displaySetService.subscribe(
    displaySetService.EVENTS.DISPLAY_SETS_ADDED,
    ({ displaySetsAdded }) => {
      displaySetsAdded?.forEach(checkDisplaySet);
    }
  );
}

/** Tears down the display set subscription when the mode exits. */
export function unregisterDataAvailabilityChecks(): void {
  displaySetsSubscription?.unsubscribe();
  displaySetsSubscription = null;
}
