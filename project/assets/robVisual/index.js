import { splitStartupRedux } from 'utils/WebpackSplit';

const startup = function(element){
    import('robVisual/containers/Root').then((Component) => {
        import('robVisual/store/configureStore').then((store) => {
            splitStartupRedux(element, Component.default, store.default);
        });
    });
};

export default startup;
