import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface TailQuery extends DataQuery {
  path?: string;
  rate?: string;
  head?: string;
}

export interface TailOptions extends DataSourceJsonData {
  prefix?: string;
  head?: string;
}
