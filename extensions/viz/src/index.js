import React from 'react';

import { version } from '../package.json';
import VizViewer from './components/VizViewer';
import VizViewerDataContainer from './components/VizViewerDataContainer';

export default {
  /**
   * Only required property. Should be a unique value across all extensions.
   */
  id: 'viz',
  version,

  /**
   * @param {object} params
   * @param {ServicesManager} params.servicesManager
   * @param {CommandsManager} params.commandsManager
   * @param {object} params.appConfig
   */
  getDataModule({
    servicesManager,
    commandsManager,
    extensionManager,
    appConfig,
  }) {
    const ExtendedVizViewerDataContainer = props => {
      return (
        <VizViewerDataContainer
          {...props}
          extensionManager={extensionManager}
          appConfig={appConfig}
        />
      );
    };
    return [
      {
        component: ExtendedVizViewerDataContainer,
      },
    ];
  },

  /**
   * @param {object} params
   * @param {ServicesManager} params.servicesManager
   * @param {CommandsManager} params.commandsManager
   * @param {object} params.appConfig
   */
  getRoutesModule({
    servicesManager,
    commandsManager,
    extensionManager,
    appConfig,
  }) {
    const ExtendedVizViewer = props => {
      return (
        <VizViewer
          {...props}
          extensionManager={extensionManager}
          appConfig={appConfig}
        />
      );
    };
    return [
      {
        viz: {
          path: '/viz',
          component: ExtendedVizViewer,
        },
      },
    ];
  },
};
