// Types
import {merge, Observable} from 'rxjs';
import {
    CircularDataFrame,
    DataQueryRequest,
    DataQueryResponse,
    DataSourceApi,
    DataSourceInstanceSettings,
    FieldType,
    LoadingState,
} from '@grafana/data';

import {TailOptions, TailQuery} from './types';

export class TailDataSource extends DataSourceApi<TailQuery> {
    private base = '';

    constructor(private instanceSettings: DataSourceInstanceSettings<TailOptions>) {
        super(instanceSettings);

        this.base = instanceSettings.url + '?name=';
        if (instanceSettings.jsonData.prefix) {
            this.base += encodeURI(instanceSettings.jsonData.prefix);
        }
        console.log("Creating Tail Datasource");
    }

    getQueryDisplayText(query: TailQuery) {
        return `Tail: ${query.path}`;
    }

    query(options: DataQueryRequest<TailQuery>): Observable<DataQueryResponse> {
        const streams: Array<Observable<DataQueryResponse>> = [];
        for (const target of options.targets) {
            const stream = new Observable<DataQueryResponse>(subscriber => {
                const streamId = `fetch-${target.refId}`;
                let maxDataPoints = 1000;
                const from = options.range?.from.valueOf();
                const to = options.range?.to.valueOf();
                if (from && to && target.rate && Number(target.rate)) {
                    const diff = to - from;
                    maxDataPoints = diff / Number(target.rate);
                    console.log("diff: " + diff + " maxDP " + maxDataPoints);
                }

                const data = new CircularDataFrame({
                    append: 'tail',
                    capacity: maxDataPoints,
                });
                data.refId = target.refId;
                data.name = 'Fetch ' + target.refId;
                data.addField({name: 'time', type: FieldType.time});
                data.addField({name: 'value', type: FieldType.number});

                let reader: ReadableStreamReader<Uint8Array>;

                const processChunk = (value: ReadableStreamReadResult<Uint8Array>): any => {
                    if (value.value) {
                        let i = 0;
                        while (i < value.value.byteLength - 18) {
                            if (value.value[i] === 115 && value.value[i + 1] === 110 && value.value[i + 2] === 112) {
                                const view = new DataView(value.value.buffer);
                                const ts = view.getFloat64(i + 3);
                                const val = view.getFloat64(i + 11);
                                //console.log("TS: " + ts + " VAL: " + val);
                                data.fields[0].values.add(new Date(ts));
                                data.fields[1].values.add(val);
                                i = i + 19;
                            } else {
                                console.log(value.value);
                                i++;
                            }
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

                const controller = new AbortController();
                const signal = controller.signal;
                fetch(new Request(this.base + target.path + "&rate=" + target.rate, {
                    method: 'get',
                    signal: signal,
                })).then(response => {
                    reader = response.body!.getReader();
                    reader.read().then(processChunk);
                });

                return () => {
                    // Cancel fetch?
                    controller.abort();
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
