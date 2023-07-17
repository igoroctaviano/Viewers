import React, { useEffect } from 'react';
import { DataSourceWrapper } from '@ohif/app';

const getDataSourceWrapper = ({ extensionManager }) => {
  const GCPDataSourceWrapper = props => {
    useEffect(() => {
      extensionManager.setActiveDataSource('gcpdicomweb');
    }, []);

    // @ts-ignore
    return <DataSourceWrapper {...props} />;
  };
  return GCPDataSourceWrapper;
};

export default getDataSourceWrapper;
