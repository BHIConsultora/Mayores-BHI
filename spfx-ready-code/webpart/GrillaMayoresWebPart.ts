import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  IPropertyPaneConfiguration,
  PropertyPaneTextField
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import GrillaMayores from './components/GrillaMayores';
import { IGrillaMayoresProps } from './components/IGrillaMayoresProps';

export interface IGrillaMayoresWebPartProps {
  description: string;
}

export default class GrillaMayoresWebPart extends BaseClientSideWebPart<IGrillaMayoresWebPartProps> {

  private _isDarkTheme: boolean = false;
  private _environmentMessage: string = '';

  public render(): void {
    const element: React.ReactElement<IGrillaMayoresProps> = React.createElement(
      GrillaMayores,
      {
        description: this.properties.description,
        isDarkTheme: this._isDarkTheme,
        environmentMessage: this._environmentMessage,
        hasTeamsContext: !!this.context.sdks.microsoftTeams,
        userDisplayName: this.context.pageContext.user.displayName,
        context: this.context
      }
    );

    ReactDom.render(element, this.domElement);
  }

  protected onInit(): Promise<void> {
    return super.onInit();
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description: "Configuración del Web Part"
          },
          groups: [
            {
              groupName: "Opciones",
              groupFields: [
                PropertyPaneTextField('description', {
                  label: "Descripción"
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
