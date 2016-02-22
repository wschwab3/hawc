import React, { Component } from 'react';
import _ from 'underscore';
import { connect } from 'react-redux';

import EndpointCard from 'robVisual/components/EndpointCard';
import './EndpointCardContainer.css';

class EndpointCardContainer extends Component {

    render(){
        let { endpoints } = this.props;
        return (
            <div className='endpointCardContainer'>
                {_.map(endpoints, (ep, i) => { return <EndpointCard key={i} endpoint={ep}/>; })}
            </div>
        );
    }
}

function mapStateToProps(state){
    return {
        endpoints: state.filter.endpoints,
    };
}

export default connect(mapStateToProps)(EndpointCardContainer);
