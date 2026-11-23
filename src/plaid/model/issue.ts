export interface Issue {
  expand?: string;
  id?: string;
  self?: string;
  key?: string;
  fields?: {
    components?: {
      name: string;
    }[];
    issuetype?: {
      iconUrl: string;
      name: string;
    };
    parent?: Issue;
    priority?: {
      iconUrl: string;
      name: string;
    };
    summary?: string;
    status?: {
      name: string;
      statusCategory?: {
        colorName: string;
      };
    };
  };
  renderedFields?: Record<string, unknown>;
  properties?: any;
  names?: Record<string, unknown>;
  schema?: Record<string, unknown>;
  transitions?: any[];
  operations?: any;
  editmeta?: any;
  changelog?: any;
  versionedRepresentations?: Record<string, unknown>;
  fieldsToInclude?: any;

  _favorite?: boolean;
}
