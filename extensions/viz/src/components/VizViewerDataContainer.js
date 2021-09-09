import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import DICOMAccess from '../DICOMAccess';

const VizViewerDataContainer = ({
  extensionManager,
  appConfig,
  studyInstanceUIDs,
  seriesInstanceUIDs,
  viewerComponent: OHIFViewer,
}) => {
  const [study, setStudy] = useState();

  const StudyInstanceUID = studyInstanceUIDs[0];
  const SeriesInstanceUIDs = seriesInstanceUIDs || [];

  useEffect(() => {
    const dicomAccess = new DICOMAccess({
      servers: appConfig.servers.dicomWeb,
      extensionManager,
    });

    const retrieveStudyData = async () => {
      const studyMetadata = await dicomAccess.retrieveStudyMetadata(
        StudyInstanceUID,
        SeriesInstanceUIDs
      );
      setStudy(studyMetadata.getData());
    };

    retrieveStudyData();
  }, [
    SeriesInstanceUIDs,
    StudyInstanceUID,
    appConfig.servers.dicomWeb,
    extensionManager,
  ]);

  const studies = study ? [study] : [];

  return (
    <OHIFViewer
      studies={studies}
      isStudyLoaded={studies.length > 0}
      studyInstanceUIDs={studyInstanceUIDs}
    />
  );
};

VizViewerDataContainer.propTypes = {
  extensionManager: PropTypes.object.isRequired,
  appConfig: PropTypes.object.isRequired,
  studyInstanceUIDs: PropTypes.array.isRequired,
  seriesInstanceUIDs: PropTypes.array,
  viewerComponent: PropTypes.any,
};

export default VizViewerDataContainer;
