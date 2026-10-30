/** Result of asking one DICOMweb data source which series it holds for a study. */
export type SourceAvailability = {
  sourceName: string;
  label: string;
  status: 'found' | 'empty' | 'failed';
  seriesInstanceUIDs: Set<string>;
  error?: unknown;
};

export type StudyAvailability = {
  StudyInstanceUID: string;
  sources: SourceAvailability[];
};

export type CheckedDataSource = {
  sourceName: string;
  label: string;
  dataSource: {
    query: { series: { search: (studyInstanceUid: string) => Promise<unknown[]> } };
  };
};

/**
 * Queries every data source for the series of a study in parallel. A failed
 * query is recorded rather than thrown, so one unreachable store does not hide
 * the result of the others.
 */
export async function checkStudyAvailability(
  StudyInstanceUID: string,
  dataSources: CheckedDataSource[]
): Promise<StudyAvailability> {
  const results = await Promise.allSettled(
    dataSources.map(({ dataSource }) => dataSource.query.series.search(StudyInstanceUID))
  );

  const sources = results.map((result, index): SourceAvailability => {
    const { sourceName, label } = dataSources[index];

    if (result.status === 'rejected') {
      return {
        sourceName,
        label,
        status: 'failed',
        seriesInstanceUIDs: new Set(),
        error: result.reason,
      };
    }

    const series = (Array.isArray(result.value) ? result.value : []) as Array<{
      seriesInstanceUid?: string;
    }>;
    const seriesInstanceUIDs = new Set(series.map(s => s.seriesInstanceUid).filter(Boolean));

    return {
      sourceName,
      label,
      status: seriesInstanceUIDs.size ? 'found' : 'empty',
      seriesInstanceUIDs,
    };
  });

  return { StudyInstanceUID, sources };
}

/**
 * Returns true when a derived display set (SEG, RTSTRUCT, ...) references a
 * series that no successfully queried data source holds for its study.
 */
export function isReferencedSeriesMissing(
  displaySet: { StudyInstanceUID?: string; referencedSeriesInstanceUID?: string | null },
  availability: StudyAvailability
): boolean {
  const { referencedSeriesInstanceUID } = displaySet;
  if (!referencedSeriesInstanceUID) {
    return false;
  }
  if (displaySet.StudyInstanceUID !== availability.StudyInstanceUID) {
    return false;
  }

  const answered = availability.sources.filter(source => source.status !== 'failed');
  if (!answered.length) {
    return false;
  }

  return !answered.some(source => source.seriesInstanceUIDs.has(referencedSeriesInstanceUID));
}

/** Extracts a readable reason from a dicomweb-client or fetch error. */
export function describeError(error: unknown): string {
  const { status, message, request } = (error ?? {}) as {
    status?: number;
    message?: string;
    request?: { statusText?: string };
  };
  const statusText = request?.statusText;
  if (status) {
    return statusText ? `HTTP ${status} ${statusText}` : `HTTP ${status}`;
  }
  return message || String(error);
}
