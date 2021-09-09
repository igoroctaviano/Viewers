import { QIDO, WADO } from './services/';
import {
  deleteStudyMetadataPromise,
  retrieveStudyMetadata,
} from './retrieveStudyMetadata.js';

import getStudyBoxData from './getStudyBoxData';
import retrieveStudiesMetadata from './retrieveStudiesMetadata.js';
import searchStudies from './searchStudies';
import sortStudy from './sortStudy';
import * as studyInstanceHelpers from './services/wado/studyInstanceHelpers';

const studies = {
  services: {
    QIDO,
    WADO,
  },
  loadingDict: {},
  retrieveStudyMetadata,
  deleteStudyMetadataPromise,
  retrieveStudiesMetadata,
  getStudyBoxData,
  searchStudies,
  sortStudy,
  helpers: {
    studyInstanceHelpers,
  },
};

export default studies;
