import _ from 'underscore';
import * as types from 'mgmt/TaskAssignments/constants';


const defaultState = {
    isFetching: false,
    isLoaded: false,
    list: [],
};

function tasks(state=defaultState, action) {
    let index, list;
    switch (action.type) {
    case types.REQUEST_TASKS:
        return Object.assign({}, state, {
            isFetching: true,
            isLoaded: false,
        });

    case types.RECEIVE_TASKS:
        return Object.assign({}, state, {
            isFetching: false,
            isLoaded: true,
            list: action.tasks,
        });

    case types.PATCH_TASK:
        index = state.list.indexOf(
            _.findWhere(state.list, {id: action.task.id})
        );
        if (index >= 0){
            list = [
                ...state.list.slice(0, index),
                {...state.list[index], ..._.omit(action.task, 'csrfmiddlewaretoken')},
                ...state.list.slice(index + 1),
            ];
        }
        return Object.assign({}, state, {list});

    default:
        return state;
    }
}

export default tasks;
