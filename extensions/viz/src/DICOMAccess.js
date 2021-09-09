import { api } from 'dicomweb-client';
import dcmjs from 'dcmjs';

/** OHIF dependencies */
import { studies, metadata, utils, MODULE_TYPES, DICOMWeb } from '@ohif/core';

const { DicomMetaDictionary } = dcmjs.data;

const { OHIFStudyMetadata, OHIFSeriesMetadata } = metadata;
const { studyMetadataManager, makeDeferred } = utils;
const {
  addInstancesToStudy,
  createStudyFromSOPInstanceList,
} = studies.helpers.studyInstanceHelpers;

/** Private attributes */
const _studyMetadataPromises = Symbol('studyMetadataPromises');

/**
 * Class to provide access to DICOM data.
 *
 * @class
 * @classdesc Provides DICOM data access
 */
class DICOMAccess {
  [_studyMetadataPromises] = new Map();

  constructor({ servers = {}, extensionManager }) {
    this.extensionManager = extensionManager;
    this.server = servers[0];
    this.client = new api.DICOMwebClient({
      url: this.server.qidoRoot,
      headers: DICOMWeb.getAuthorizationHeader(this.server),
    });
  }

  /**
   *
   * @param {string} StudyInstanceUID Study instance uid
   * @param {array} sopInstances SOP instance metadata objects
   * @returns instance of OHIFStudyMetadata
   */
  async createAndHydrateStudyMetadataFromSOPInstances(
    StudyInstanceUID,
    sopInstances
  ) {
    const study = await createStudyFromSOPInstanceList(
      this.server,
      sopInstances
    );
    const studyMetadata = new OHIFStudyMetadata(study, StudyInstanceUID);
    study.displaySets = studyMetadata.createDisplaySets(
      this.extensionManager.modules[MODULE_TYPES.SOP_CLASS_HANDLER]
    );
    studyMetadataManager.add(studyMetadata);
    return studyMetadata;
  }

  /**
   * Adds sop instances to existent study metadata instance
   * generating additional display sets.
   *
   * @param {OHIFStudyMetadata} studyMetadata study metadata instance
   * @param {string} SeriesInstanceUID series instance uid
   * @param {array} sopInstances SOP instance metadata objects
   */
  async addInstancesToExistentStudyMetadata(
    studyMetadata,
    SeriesInstanceUID,
    sopInstances
  ) {
    const study = studyMetadata.getData();
    await addInstancesToStudy(this.server, study, sopInstances);
    const series = study.series.find(
      s => s.SeriesInstanceUID === SeriesInstanceUID
    );
    const seriesMetadata = new OHIFSeriesMetadata(series, study, null, {});
    studyMetadata.addSeries(seriesMetadata);
    studyMetadata.createAndAddDisplaySetsForSeries(
      this.extensionManager.modules[MODULE_TYPES.SOP_CLASS_HANDLER],
      seriesMetadata
    );
  }

  /**
   * Fetches, parses and hydrates OHIF metadata provider with study metadata
   *
   * @param {string} StudyInstanceUID The study instance uid
   * @param {String} SeriesInstanceUIDs The series instance uid
   */
  async loadStudyMetadata(StudyInstanceUID, SeriesInstanceUIDs) {
    let studyMetadata = studyMetadataManager.get(StudyInstanceUID);

    const promises = SeriesInstanceUIDs.map(async SeriesInstanceUID => {
      /** Skip retrieval if this series metadata already exists. */
      if (studyMetadata && studyMetadata.getSeriesByUID(SeriesInstanceUID)) {
        return Promise.resolve();
      }

      const sopInstances = await this.client.retrieveSeriesMetadata({
        studyInstanceUID: StudyInstanceUID,
        seriesInstanceUID: SeriesInstanceUID,
      });

      if (!sopInstances.length) {
        return Promise.resolve();
      }

      studyMetadata = studyMetadataManager.get(StudyInstanceUID);
      if (!studyMetadata) {
        studyMetadata = await this.createAndHydrateStudyMetadataFromSOPInstances(
          StudyInstanceUID,
          sopInstances
        );
      } else {
        await this.addInstancesToExistentStudyMetadata(
          studyMetadata,
          SeriesInstanceUID,
          sopInstances
        );
      }
    });

    await Promise.all(promises);

    return studyMetadata;
  }

  /**
   * Checks if OHIF is hydrated with the complete
   * study with all series provided.
   *
   * @param {string} StudyInstanceUID
   * @param {string} SeriesInstanceUIDs
   * @returns
   */
  isStudyCompleteWithAllSeriesNecessary(StudyInstanceUID, SeriesInstanceUIDs) {
    const existentStudyMetadata = studyMetadataManager.get(StudyInstanceUID);
    return (
      existentStudyMetadata &&
      existentStudyMetadata instanceof OHIFStudyMetadata &&
      SeriesInstanceUIDs.every(SeriesInstanceUID =>
        existentStudyMetadata
          .getData()
          .series.map(s => s.SeriesInstanceUID)
          .includes(SeriesInstanceUID)
      )
    );
  }

  async getSeriesInstanceUIDsFromStudy(StudyInstanceUID) {
    const seriesData = await this.client.searchForSeries({
      studyInstanceUID: StudyInstanceUID,
    });
    const series = seriesData.map(s =>
      DicomMetaDictionary.naturalizeDataset(s)
    );
    return series.map(s => s.SeriesInstanceUID);
  }

  /**
   * Checks if study is complete and if not execute
   * loading, parsing and hydration of missing metadata.
   *
   * @param {String} StudyInstanceUID StudyInstanceUID of the study
   * @param {Array} SeriesInstanceUIDs SeriesInstanceUIDs of the study
   * @param {Array} sopClassHandlerModules List with SOP Class Handler Modules
   * @returns {void} studyMetadata
   */
  async retrieveStudyMetadata(StudyInstanceUID, SeriesInstanceUIDs) {
    if (
      this.isStudyCompleteWithAllSeriesNecessary(
        StudyInstanceUID,
        SeriesInstanceUIDs
      )
    ) {
      return studyMetadataManager.get(StudyInstanceUID);
    }

    const studyMetadataPromises = this[_studyMetadataPromises];
    const pendingOperation = studyMetadataPromises.get(StudyInstanceUID);
    if (pendingOperation && pendingOperation instanceof Promise) {
      return await pendingOperation;
    }

    const deferred = makeDeferred();
    studyMetadataPromises.set(StudyInstanceUID, deferred.promise);

    try {
      if (!SeriesInstanceUIDs || SeriesInstanceUIDs < 1) {
        SeriesInstanceUIDs = await this.getSeriesInstanceUIDsFromStudy(
          StudyInstanceUID
        );
      }

      const studyMetadata = await this.loadStudyMetadata(
        StudyInstanceUID,
        SeriesInstanceUIDs
      );

      if (!(studyMetadata instanceof OHIFStudyMetadata)) {
        throw new Error('Metadata representation should be OHIFStudyMetadata.');
      }

      deferred.resolve(studyMetadata);
    } catch (error) {
      deferred.reject(error);
    }

    studyMetadataPromises.delete(StudyInstanceUID);

    return await deferred.promise;
  }

  /**
   * Returns OHIF study metadata instance by StudyInstanceUID
   * using the study metadata manager.
   *
   * @param {String} StudyInstanceUID Study instance uid
   * @returns {OHIFStudyMetadata} OHIF study metadata instance
   */
  getStudyMetadata(StudyInstanceUID) {
    return studyMetadataManager.get(StudyInstanceUID) || null;
  }
}

/** Exports */
export default DICOMAccess;
