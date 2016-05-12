import React, { Component, PropTypes } from 'react';
import { Provider } from 'react-redux';

import { loadConfig } from 'shared/actions/Config';
import AggregateGraph from './AggregateGraph';
import RiskOfBiasDisplay from './RiskOfBiasDisplay';


class Root extends Component {

    componentWillMount(){
        this.props.store.dispatch(loadConfig());
    }

    render() {
        let store = this.props.store;
        return (
            <Provider store={store}>
                <div>
                    <h1>Show all reviews</h1>
                <AggregateGraph />
                <RiskOfBiasDisplay />
                </div>
            </Provider>
        );
    }
}

Root.propTypes = {
    store: PropTypes.object.isRequired,
};

export default Root;
