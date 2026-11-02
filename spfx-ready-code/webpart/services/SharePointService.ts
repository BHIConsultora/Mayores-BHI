import { SPFI, spfi, SPFx } from "@pnp/sp";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/items";
import { WebPartContext } from '@microsoft/sp-webpart-base';

export class SharePointService {
  private sp: SPFI;
  private readonly LIST_NAME = "GrillaMayoresTemplates";

  constructor(context: WebPartContext) {
    // Inicializa PnPjs con el contexto de Teams/SharePoint
    this.sp = spfi().using(SPFx(context));
  }

  /**
   * Obtiene todos los templates guardados en la lista de SharePoint.
   */
  public async getTemplates(): Promise<{id: number, cliente: string, config: any[]}[]> {
    try {
      const items = await this.sp.web.lists.getByTitle(this.LIST_NAME).items.select("Id", "Title", "TemplateData")();
      return items.map(i => ({
        id: i.Id,
        cliente: i.Title,
        config: JSON.parse(i.TemplateData || "[]")
      }));
    } catch (e) {
      console.error("Error obteniendo templates. Asegurate de que la lista 'GrillaMayoresTemplates' exista en el sitio.", e);
      return [];
    }
  }

  /**
   * Guarda o actualiza el template de un cliente específico.
   */
  public async saveTemplate(cliente: string, templateData: any[]): Promise<void> {
    try {
      const list = this.sp.web.lists.getByTitle(this.LIST_NAME);
      const existing = await list.items.filter(`Title eq '${cliente}'`)();
      
      if (existing.length > 0) {
        await list.items.getById(existing[0].Id).update({
          TemplateData: JSON.stringify(templateData)
        });
      } else {
        await list.items.add({
          Title: cliente,
          TemplateData: JSON.stringify(templateData)
        });
      }
    } catch (e) {
      console.error("Error guardando el template.", e);
      throw e;
    }
  }
}
