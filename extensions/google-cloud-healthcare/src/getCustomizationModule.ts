import AddGoogleDataSourceComponent from './components/AddGoogleDataSourceComponent';
import { WorkList }  from '@ohif/app';
import getDataSourceWrapper from './components/GCPDataSourceWrapper';

function getCustomizationModule({ servicesManager, extensionManager }) {

  return [
    {
      name: 'gcpWorklist',
      value: {
        id: 'customRoutes',
        routes: [
          {
            path: '/projects/:project/locations/:location/datasets/:dataset/dicomStores/:dicomStore',
            children: getDataSourceWrapper({ extensionManager }),
            private: true,
            props: {
              children: WorkList,
              servicesManager,
              extensionManager
            },
          },
        ],
      },
    },
    {
      name: 'addGoogleCloudDataSourceComponent',
      value: {
        id: 'addDataSourceComponent',
        component: AddGoogleDataSourceComponent,
      },
    },
  ];
}

export default getCustomizationModule;
