import React, { Component, PropTypes } from 'react';
import _ from 'underscore';

import { ENDPOINT_TYPES } from 'mgmt/ERTaskTable/constants';


class ExperimentSelector extends Component {

    constructor(props) {
        super(props);
        this.state = {
            type: null,
        };
        this.handleChange = this.handleChange.bind(this);
    }

    handleChange({target: {options}}) {
        let values = [...options].filter((option) => option.selected)
                                 .map((option) => option.value);
        this.props.handleChange(values);
    }

    render() {
        return (
            <div className={this.props.className}>
                <label className='control-label'>Experiment filter (optional):</label>
                <select multiple name="experiment_filter" id="experiment_filter" onChange={this.handleChange} style={{height: '80px'}}>
                {_.map(ENDPOINT_TYPES, (choice, key) => {
                    return <option key={key} value={key}>{choice}</option>;
                })}
                </select>
            </div>
        );
    }
}

ExperimentSelector.propTypes = {
    handleChange: PropTypes.func.isRequired,
};

export default ExperimentSelector;