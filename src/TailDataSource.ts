// Types
import { Observable, merge } from 'rxjs';
import {
  CircularDataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  FieldType,
  LoadingState,
} from '@grafana/data';

import { TailQuery, TailOptions } from './types';

export class TailDataSource extends DataSourceApi<TailQuery> {
  private base = '';

  constructor(private instanceSettings: DataSourceInstanceSettings<TailOptions>) {
    super(instanceSettings);

    this.base = instanceSettings.url + '?name=';
    if (instanceSettings.jsonData.prefix) {
      this.base += encodeURI(instanceSettings.jsonData.prefix);
    }
  }

  getQueryDisplayText(query: TailQuery) {
    return `Tail: ${query.path}`;
  }

  query(options: DataQueryRequest<TailQuery>): Observable<DataQueryResponse> {
    const streams: Array<Observable<DataQueryResponse>> = [];
    for (const target of options.targets) {
      const stream = new Observable<DataQueryResponse>(subscriber => {
        const streamId = `fetch-${target.refId}`;
        const maxDataPoints = 1000;

        const data = new CircularDataFrame({
          append: 'tail',
          capacity: maxDataPoints,
        });
        data.refId = target.refId;
        data.name = 'Fetch ' + target.refId;
        data.addField({ name: 'time', type: FieldType.time });
        data.addField({ name: 'value', type: FieldType.number });

        let reader: ReadableStreamReader<Uint8Array>;

        const processChunk = (value: ReadableStreamReadResult<Uint8Array>): any => {
          if (value.value) {
            const text = new TextDecoder().decode(value.value);
            const parts = text.split(' ');
            if (parts.length === 2) {
              data.fields[0].values.add(new Date(Number(parts[0])));
              data.fields[1].values.add(Number(parts[1]));
            }
          }

          subscriber.next({
            data: [data],
            key: streamId,
            state: value.done ? LoadingState.Done : LoadingState.Streaming,
          });

          if (value.done) {
            console.log('Finished stream');
            subscriber.complete(); // necessary?
            return;
          }

          return reader.read().then(processChunk);
        };

        fetch(new Request(this.base + target.path)).then(response => {
          reader = response.body!.getReader();
          reader.read().then(processChunk);
        });

        return () => {
          // Cancel fetch?
          console.log('unsubscribing to stream ' + streamId);
        };
      });

      streams.push(stream);
    }
    return merge(...streams);
  }

  testDatasource() {
    const url = this.instanceSettings.url;
    if (!url || !url.startsWith('http')) {
      return Promise.resolve({
        status: 'error',
        message: 'Invalid URL',
      });
    }

    return fetch(url + '?TEST=YES', {
      method: 'GET',
    }).then(response => {
      console.log('RESPONSE', response);
      return {
        status: 'success',
        message: 'OK',
      };
    });
  }
}
