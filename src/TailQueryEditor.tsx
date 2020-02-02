// Libraries
import React, {ChangeEvent, PureComponent} from 'react';
// Types
import {TailDataSource} from './TailDataSource';
import {TailOptions, TailQuery} from './types';

import {FormField} from '@grafana/ui';
import {QueryEditorProps} from "@grafana/data";

type Props = QueryEditorProps<TailDataSource, TailQuery, TailOptions>;

interface State {
}

export class TailQueryEditor extends PureComponent<Props, State> {
    onPathChange = (event: ChangeEvent<HTMLInputElement>) => {
        const {onChange, query} = this.props;
        onChange({...query, path: event.target.value});
    };

    render() {
        const {query} = this.props;

        return (
            <div className="gf-form">
                <FormField
                    label="Path"
                    labelWidth={6}
                    onChange={this.onPathChange}
                    value={query.path}
                    tooltip={'The HTTP request path'}
                    placeholder="/var/log/path.log"
                />
            </div>
        );
    }
}
