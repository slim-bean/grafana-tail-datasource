import {
  DataQueryRequest,
  SeriesData,
  DataStreamObserver,
  DataStreamState,
  LoadingState,
  CSVReader,
} from '@grafana/ui';
import {TailQuery} from 'types';

export class FileWorker extends Promise<DataStreamState> {
  controller = new AbortController();
  csv?: CSVReader;
  reader?: ReadableStreamReader<Uint8Array>;
  state: DataStreamState;
  useStream = false; // starts as false
  cancel = false;
  chunkCount = 0;
  last = Date.now();

  constructor(
    url: string,
    query: TailQuery,
    request: DataQueryRequest,
    private observer: DataStreamObserver
  ) {
    super((resolve, reject) => {
      return fetch(
        new Request(url, {
          method: 'GET',
          signal: this.controller.signal,
        })
      ).then(r => {
        if (r.status !== 200) {
          this.state.error = {
            message: 'error loading url',
            status: r.status + '',
            statusText: r.statusText,
            refId: query.refId,
          };
          this.state.state = LoadingState.Error;
          if (this.useStream) {
            this.observer(this.state);
          }
          reject(this.state.error);
        } else if (r.body) {
          this.state.state = LoadingState.Streaming;
          this.reader = r.body.getReader();
          return this.reader
            .read()
            .then(this.processChunk)
            .then(() => {
              resolve(this.state);
              return this.state;
            });
        }

        reject('Missing Body');
        return this.state;
      });
    });

    //this.csv = new CSVReader({callback: this});
    this.state = {
      key: query.refId,
      state: LoadingState.Loading,
      request,
      unsubscribe: this.unsubscribe,
    };
  }

  unsubscribe = () => {
    const {state} = this.state;
    if (state === LoadingState.Loading || LoadingState.Streaming) {
      this.controller.abort();
    }
  };

  processChunk = (value: ReadableStreamReadResult<Uint8Array>): any => {
    if (!this.csv) {
      this.csv = new CSVReader({callback: this});
    }
    this.chunkCount++;
    this.last = Date.now();

    if (value.value) {
      const text = new TextDecoder().decode(value.value);
      this.csv.readCSV(text);
    }

    if (value.done && this.state.state !== LoadingState.Error) {
      this.state.state = LoadingState.Done;
    }

    // TODO, check series length

    if (this.useStream) {
      this.observer(this.state);
    }

    if (value.done) {
      return;
    }
    return this.reader!.read().then(this.processChunk);
  };

  onHeader = (series: SeriesData) => {
    series.refId = this.state.key;
    this.state.series = [series];
  };

  onRow = (row: any[]) => {
    const series = this.state.series![0];
    if (!series.rows) {
      series.rows = [];
    }
    series.rows.push(row);
  };
}