import $ from '$';
import _ from 'underscore';
import d3 from 'd3';

import D3Plot from 'utils/D3Plot';
import HAWCUtils from 'utils/HAWCUtils';

import DataPivot from './DataPivot';
import DataPivotExtension from './DataPivotExtension';
import DataPivotLegend from './DataPivotLegend';
import {
    StyleLine,
    StyleSymbol,
    StyleText,
} from './Styles';
import {
   NULL_CASE,
} from './shared';


class DataPivotVisualization extends D3Plot {

    constructor(dp_data, dp_settings, plot_div, editable){
        // Metadata viewer visualization
        super();
        this.editable = editable || false;
        this.dp_data = dp_data;
        this.dp_settings = dp_settings;
        this.plot_div = plot_div;
        this.set_defaults();
        this.build_plot();
        this.dpe = new DataPivotExtension();
        return this;
    }

    static sorter(arr, sorts){
        var chunkify = function(t){
                var tz = [], x = 0, y = -1, n = 0, i, j;
                while(i == (j = t.charAt(x++)).charCodeAt(0)){
                    var m = (i == 46 || i == 45 || (i >=48 && i <= 57));
                    if (m !== n) {
                        tz[++y] = '';
                        n = m;
                    }
                    tz[y] += j;
                }
                return tz;
            },
            alphanum = function(a, b){
                var field_name,
                    ascending;

                for(var i=0; i<sorts.length; i++){

                    field_name = sorts[i].field_name;
                    ascending = sorts[i].ascending;

                    if (a[field_name].toString() !== b[field_name].toString()){
                        break;
                    }
                }

                var aa = chunkify(a[field_name].toString()),
                    bb = chunkify(b[field_name].toString());

                for (var x = 0; aa[x] && bb[x]; x++) {
                    if (aa[x] !== bb[x]) {
                        var c = Number(aa[x]),
                            d = Number(bb[x]);
                        if (c == aa[x] && d == bb[x]) {
                            if (ascending){
                                return c - d;
                            } else {
                                return d - c;
                            }
                        } else {
                            if (ascending){
                                return (aa[x] > bb[x]) ? 1 : -1;
                            } else {
                                return (aa[x] < bb[x]) ? 1 : -1;
                            }
                        }
                    }
                }

                if(ascending){
                    return aa.length - bb.length;
                } else {
                    return bb.length - aa.length;
                }
            };

        if (sorts.length>0){
            return arr.sort(alphanum);
        } else {
            return arr;
        }
    }

    static filter(arr, filters, filter_logic){
        if(filters.length===0) return arr;

        var field_name, value, func,
            new_arr = [],
            included = d3.map(),
            filters_map = d3.map({
                lt(v){return v[field_name]<value;},
                lte(v){return v[field_name]<=value;},
                gt(v){return v[field_name]>value;},
                gte(v){return v[field_name]>=value;},
                contains(v){return v[field_name].toString().toLowerCase().indexOf(value.toLowerCase())>=0;},
                not_contains(v){return v[field_name].toString().toLowerCase().indexOf(value.toLowerCase())<0;},
                exact(v){return v[field_name].toString().toLowerCase() === value.toLowerCase();},
            });

        if(filter_logic === 'and') new_arr = arr;

        for(var i=0; i<filters.length; i++){
            func = filters_map.get(filters[i].quantifier);
            field_name = filters[i].field_name;
            if(field_name === NULL_CASE) continue;
            value = filters[i].value;
            if (func){
                if(filter_logic === 'and'){
                    new_arr = new_arr.filter(func);
                } else {
                    var vals = arr.filter(func);
                    vals.forEach(function(v){ included.set(v._dp_pk, v); });
                }
            } else {
                console.log('Unrecognized filter: {0}'.printf(filters[i].quantifier));
            }
        }

        if(filter_logic === 'or') new_arr = included.values();

        return new_arr;
    }

    static shouldInclude(row, bar, points){
        // Determine row inclusion. Rows can either be included by having any
        // single data-point field being numeric, OR, if both the low-range and
        // high-range fields are both true.
        if (_.some(points, function(d){ return $.isNumeric(row[d.field_name]); })) return true;
        return (($.isNumeric(row[bar.low_field_name])) && ($.isNumeric(row[bar.high_field_name])));
    }

    set_defaults(){
        this.padding = $.extend({}, this.dp_settings.plot_settings.padding); //copy object
        this.padding.left_original = this.padding.left;
        this.w = this.dp_settings.plot_settings.plot_width;
        this.h = this.w;  // temporary; depends on rendered text-size
        this.textPadding = 5; // text padding on all sides of text

        var scale_type = (this.dp_settings.plot_settings.logscale) ? 'log' : 'linear',
            formatNumber = d3.format(',.f');

        this.text_spacing_offset = 10;
        this.x_axis_settings = {
            scale_type,
            text_orient: 'bottom',
            axis_class: 'axis x_axis',
            gridline_class: 'primary_gridlines x_gridlines',
            number_ticks: 10,
            axis_labels: true,
            x_translate: 0,
            label_format: formatNumber,
        };

        this.y_axis_settings = {
            scale_type: 'linear',
            text_orient: 'left',
            axis_class: 'axis y_axis',
            gridline_class: 'primary_gridlines y_gridlines',
            axis_labels: false,
            x_translate: 0,
            y_translate: 0,
            label_format: undefined,  //default
        };
    }

    build_plot(){
        this.plot_div.html('');
        this.get_dataset();
        if (this.dp_data.length === 0 ){
            return HAWCUtils.addAlert('<strong>Error: </strong>no data are available to be plotted', this.plot_div);
        }
        if (this.datarows.length === 0 ){
            return HAWCUtils.addAlert('<strong>Error: </strong>data exists, but settings need to be modified (currently no rows are displayed).', this.plot_div);
        }
        this.build_plot_skeleton(true);
        this.set_font_style();
        this.layout_text();
        this.layout_plot();
        this.add_axes();
        this.draw_visualizations();
        this.add_final_rectangle();
        this.legend = new DataPivotLegend(
            this.vis,
            this.dp_settings.legend,
            this.dp_settings,
            {offset: true, editable: this.editable});
        this.add_menu();
        this.trigger_resize();
    }

    set_font_style(){
        var font;
        switch (this.dp_settings.plot_settings.font_style){
        case 'Times New Roman':
            font = 'Times New Roman;';
            break;
        case 'Arial':
        default:
            font = 'Arial;';
        }
        d3.select(this.svg).attr('style', 'font-family: {0}'.printf(font));
    }

    get_dataset(){
        var self = this,
            settings = {
                datapoints: [],
                bars: {},
                descriptions: [],
                sorts: [],
                filters: [],
                reference_lines: [],
                reference_rectangles: [],
                labels: [],
                spacers: {},
                spacer_lines: [],
            },
            rows,
            get_associated_style = function(style_type, style_name){

                var defaults = {
                    symbols: StyleSymbol.default_settings,
                    lines: StyleLine.default_settings,
                    texts: StyleText.default_settings,
                };

                return self.dp_settings.styles[style_type].filter(
                    function(v){return v.name === style_name;})[0] ||
                        defaults[style_type]();
            };

        // unpack data-bars (expects only one bar)
        this.dp_settings.dataline_settings.forEach(function(datum){
            settings.bars.low_field_name = datum.low_field_name;
            settings.bars.high_field_name = datum.high_field_name;
            settings.bars.header_name = datum.header_name;
            settings.bars.marker_style = datum.marker_style;
        });

        // unpack datapoints and data bar settings
        this.dp_settings.datapoint_settings.forEach(function(datum){
            if (datum.field_name !== NULL_CASE){
                var copy = {};

                // get dpe settings (if any)
                if(datum.dpe !== NULL_CASE){
                    DataPivotExtension.update_extensions(copy, datum.dpe);
                }

                // now, push extended settings values
                settings.datapoints.push($.extend(copy, datum));
            }
        });

        // unpack description settings
        this.dp_settings.description_settings.forEach(function(datum){
            if (datum.field_name !== NULL_CASE){
                var copy = {};
                // get dpe settings (if any)
                if(datum.dpe !== NULL_CASE){
                    DataPivotExtension.update_extensions(copy, datum.dpe);
                }
                // now, push extended settings values
                settings.descriptions.push($.extend(copy, datum));
            }
        });

        var get_selected_fields = function(v){return v.field_name !== NULL_CASE;};
        settings.sorts = this.dp_settings.sorts.filter(get_selected_fields);
        settings.filters = this.dp_settings.filters.filter(get_selected_fields);

        // unpack reference lines
        this.dp_settings.reference_lines.forEach(function(datum){
            if($.isNumeric(datum.value)){
                settings.reference_lines.push({
                    style: get_associated_style('lines', datum.line_style),
                    x1: datum.value,
                    x2: datum.value});
            }
        });

        // unpack reference rectangles
        this.dp_settings.reference_rectangles.forEach(function(datum){
            if($.isNumeric(datum.x1) && $.isNumeric(datum.x2)){
                settings.reference_rectangles.push({
                    style: get_associated_style('rectangles', datum.rectangle_style),
                    x1: datum.x1,
                    x2: datum.x2});
            }
        });

        // unpack labels
        this.dp_settings.labels.forEach(function(d){
            d._style = get_associated_style('texts', d.style);
            settings.labels.push(d);
        });

        //build data-objects for visualization
        rows = _.chain(self.dp_data)
                .filter(
                  _.partial(
                    DataPivotVisualization.shouldInclude,
                    _,
                    settings.bars,
                    self.dp_settings.datapoint_settings
                  )
                )
                .map(function(d){
                  // unpack any column-level styles
                    var styles = {
                        bars: get_associated_style('lines', settings.bars.marker_style),
                    };

                    _.chain(self.dp_settings.datapoint_settings)
                      .filter(function(d){return d.field_name !== NULL_CASE;})
                      .each(function(d, i){
                          styles['points_' + i] = get_associated_style('symbols', d.marker_style);
                      });

                    _.chain(self.dp_settings.description_settings)
                      .each(function(d, i){
                          styles['text_' + i] = get_associated_style('texts', d.text_style);
                      });

                    return _.extend(d, {'_styles': styles});
                })
                .value();

        rows = DataPivotVisualization.filter(rows, settings.filters,
                                              this.dp_settings.plot_settings.filter_logic);

        rows = DataPivotVisualization.sorter(rows, settings.sorts);

        // row-overrides: order
        this.dp_settings.row_overrides.forEach(function(v){
            // apply offsets
            if(v.offset !== 0){
                for(var i=0; i<rows.length; i++){
                    if(rows[i]._dp_pk == v.pk){
                        var new_off = i+v.offset;
                        if (new_off >= rows.length) new_off = rows.length-1;
                        if (new_off < 0) new_off = 0;
                        rows.splice(new_off, 0, rows.splice(i, 1)[0]);
                        break;
                    }
                }
            }
        });

        // row-overrides: remove (in separate loop, after offsets)
        this.dp_settings.row_overrides.forEach(function(v){
            if(v.include === false){
                for(var i=0; i<rows.length; i++){
                    if(rows[i]._dp_pk === v.pk){
                        rows.splice(i,1);
                        break;
                    }
                }
            }
        });

        // condition-formatting overrides
        this.dp_settings.datapoint_settings.forEach(function(datapoint, i){
            datapoint.conditional_formatting.forEach(function(cf){
                var arr = rows.map(function(d){return d[cf.field_name]; }),
                    vals = DataPivot.getRowDetails(arr),
                    styles = 'points_' + i;

                switch(cf.condition_type){

                case 'point-size':
                    if (vals.range){
                        var pscale = d3.scale.pow().exponent(0.5)
                              .domain(vals.range)
                              .range([cf.min_size, cf.max_size]);

                        rows.forEach(function(d){
                            if ($.isNumeric(d[cf.field_name])){
                                d._styles[styles] = $.extend({}, d._styles[styles]); //copy object
                                d._styles[styles].size = pscale( d[cf.field_name] );
                            }
                        });
                    }
                    break;

                case 'point-color':
                    if (vals.range){
                        var cscale = d3.scale.linear()
                              .domain(vals.range)
                              .interpolate(d3.interpolateRgb)
                              .range([cf.min_color, cf.max_color]);

                        rows.forEach(function(d){
                            if ($.isNumeric(d[cf.field_name])){
                                d._styles[styles] = $.extend({}, d._styles[styles]); //copy object
                                d._styles[styles].fill = cscale( d[cf.field_name] );
                            }
                        });
                    }
                    break;

                case 'discrete-style':
                    var hash = d3.map();
                    cf.discrete_styles.forEach(function(d){ hash.set(d.key, d.style); });
                    rows.forEach(function(d){
                        if(hash.get(d[cf.field_name]) !== NULL_CASE){
                            d._styles[styles] = get_associated_style('symbols', hash.get(d[cf.field_name]));
                        }
                    });

                    break;
                default:
                    console.log('Unrecognized condition_type: {0}'.printf(cf.condition_type));
                }

            });
        });

        // row-overrides: apply styles
        this.dp_settings.row_overrides.forEach(function(v){
            if((v.text_style !== NULL_CASE) ||
               (v.line_style !== NULL_CASE) ||
               (v.symbol_style !== NULL_CASE)){
                rows.forEach(function(v2){
                    if(v2._dp_pk === v.pk){
                        for(var key in v2._styles){
                            if((v.text_style !== NULL_CASE) && (key.substr(0,4) === 'text')){
                                v2._styles[key] = get_associated_style('texts', v.text_style);
                            }

                            if((v.line_style !== NULL_CASE) && (key === 'bars')){
                                v2._styles[key] = get_associated_style('lines', v.line_style);
                            }

                            if((v.symbol_style !== NULL_CASE) && (key.substr(0,6) === 'points')){
                                v2._styles[key] = get_associated_style('symbols', v.symbol_style);
                            }
                        }
                    }
                });
            }
        });

        // with final datarows subset, add index for rendered order
        rows.forEach(function(v, i){v._dp_index = i;});

        // unpack extra spacers
        this.dp_settings.spacers.forEach(function(v){
            settings.spacers['row_' + v.index] = v;
            if(v.show_line && v.index>0 && v.index<=rows.length){
                settings.spacer_lines.push({
                    index: v.index-1,
                    _styles: {
                        bars: get_associated_style('lines', v.line_style),
                    },
                });
            }
        });

        this.datarows = rows;
        this.merge_descriptions();

        this.title_str = this.dp_settings.plot_settings.title || '';
        this.x_label_text = this.dp_settings.plot_settings.axis_label || '';
        this.settings = settings;
        this.headers = this.settings.descriptions.map(function(v, i){
            return {
                row: 0,
                col: i,
                text: v.header_name,
                style: get_associated_style('texts', v.header_style),
                cursor: 'auto',
                onclick(){},
                max_width: v.max_width,
            };
        });
    }

    merge_descriptions(){
        // Merge identical columns
        var merge_aggressive = this.dp_settings.plot_settings.merge_aggressive,
            merge_until = this.dp_settings.plot_settings.merge_until || this.datarows.length-1,
            shouldMerge = this.dp_settings.plot_settings.merge_descriptions,
            field_names = this.dp_settings.description_settings.map(function(v){return v.field_name;}),
            i, j;

        if (!shouldMerge){
            for(i=this.datarows.length-1; i>0; i--){
                this.datarows[i]._dp_isMerged = false;
            }
            return;
        }

        if (merge_aggressive){
            // merge all identical columns (regardless of merge_until similarity)
            for(i=this.datarows.length-1; i>0; i--){
                this.datarows[i]._dp_isMerged = false;
                for(j=0; j<=merge_until; j++){
                    var v1 = this.datarows[i][field_names[j]],
                        v2 = this.datarows[i-1][field_names[j]];
                    if (v1 !== v2){
                        break; // stop checks on columns to the right
                    } else {
                        this.datarows[i][field_names[j]] = '';
                        if (j == merge_until){
                          // background rectangle indicates rows are related
                            this.datarows[i]._dp_isMerged = true;
                        }
                    }
                }
            }
        } else {
            // merge only columns which have the value in merge_until
            for(i=this.datarows.length-1; i>0; i--){
                shouldMerge = true;
                if(shouldMerge){
                    // check if all columns are identical between this and the prior column
                    for(j=0; j<=merge_until; j++){
                        if (this.datarows[i][field_names[j]] !== this.datarows[i-1][field_names[j]]){
                            shouldMerge = false;
                            break;
                        }
                    }
                    // Merge if passed check
                    if (shouldMerge){
                        for(j=0; j<=merge_until; j++){
                            this.datarows[i][field_names[j]] = '';
                        }
                    }
                }
                this.datarows[i]._dp_isMerged = shouldMerge;
            }
        }
    }

    add_axes(){
        var get_domain = function(self){
            var domain, fields;
            // use user-specified domain if valid
            domain = _.each(
              self.dp_settings.plot_settings.domain.split(','),
              _.partial(parseFloat, _, 10)
            );
            if ((domain.length === 2) && (_.all(domain, isFinite))) return domain;

            // calculate domain from data
            fields = _.pluck(self.settings.datapoints, 'field_name');
            fields.push(self.settings.bars.low_field_name, self.settings.bars.high_field_name);
            return d3.extent(
                _.chain(self.datarows)
                    .map(function(d){ return _.map(fields, function(f){ return d[f];}); })
                    .flatten()
                    .map(_.partial(parseFloat, _, 10))
                    .value()
            );
        };

        $.extend(this.x_axis_settings, {
            gridlines: this.dp_settings.plot_settings.show_xticks,
            domain: get_domain(this),
            rangeRound: [0, this.w],
            y_translate: this.h,
        });

        $.extend(this.y_axis_settings, {
            domain: [0, this.h],
            number_ticks: this.datarows.length,
            rangeRound: [0, this.h],
        });

        this.build_y_axis();
        this.build_x_axis();
    }

    build_background_rectangles(){
        var bgs = [],
            gridlines = [],
            everyOther = true,
            self = this,
            pushBG = function(first, last){
                bgs.push({
                    x: -self.text_width-self.padding.left,
                    y: self.row_heights[first].min,
                    w: self.text_width+self.padding.left,
                    h: self.row_heights[last].max-self.row_heights[first].min,
                });
            };

        if (this.datarows.length>0){
            var first_index = 0;
            // starting with second-row, build rectangles
            for(var i=1; i<this.datarows.length; i++){
                if (!this.datarows[i]._dp_isMerged){
                    if(everyOther){
                        pushBG(first_index, i-1);
                    }
                    everyOther = !everyOther;
                    first_index = i;
                    gridlines.push(self.row_heights[first_index].min);
                }
                // edge-case to push final-row if needed
                if (i === this.datarows.length-1 && everyOther) pushBG(first_index, i);
            }

        }
        this.bg_rectangles_data = (this.dp_settings.plot_settings.text_background) ? bgs : [];
        this.y_gridlines_data = (this.dp_settings.plot_settings.show_yticks) ? gridlines : [];
    }

    draw_visualizations(){

        var self = this,
            x = this.x_scale,
            apply_styles = function(d) {
                var obj = d3.select(this);
                for (var property in d.style) {
                    obj.style(property, d.style[property]);
                }
            }, apply_line_styles = function(d){
                var obj = d3.select(this);
                for (var property in d._styles.bars) {
                    obj.style(property, d._styles.bars[property]);
                }
            }, apply_text_styles = function(obj, styles){
                obj = d3.select(obj);
                for (var property in styles) {
                    obj.style(property, styles[property]);
                }
                if(styles.rotate>0){
                    obj.attr('transform', 'rotate({0} {1},{2})'.printf(
                        styles.rotate, obj.attr('x'), obj.attr('y')));
                }
            },
            cursor = (this.editable) ? 'pointer': 'auto',
            label_drag = (!this.editable) ? function(){} :
              HAWCUtils.updateDragLocationXY(function(x, y){
                  var p = d3.select(this);
                  p.data()[0].x = x;
                  p.data()[0].y = y;
              }),
            title_drag = (!this.editable) ? function(){} :
              HAWCUtils.updateDragLocationXY(function(x, y){
                  self.dp_settings.plot_settings.title_left = x;
                  self.dp_settings.plot_settings.title_top = y;
              }),
            xlabel_drag = (!this.editable) ? function(){} :
              HAWCUtils.updateDragLocationXY(function(x, y){
                  self.dp_settings.plot_settings.xlabel_left = x;
                  self.dp_settings.plot_settings.xlabel_top = y;
              });


        // construct inputs for background rectangles and y-gridlines
        this.build_background_rectangles();

        // add text background rectangles behind text
        this.g_text_bg_rects = this.vis.append('g');
        this.text_bg_rects = this.g_text_bg_rects.selectAll()
            .data(this.bg_rectangles_data)
            .enter().append('rect')
                .attr('x', function(d){return d.x;})
                .attr('height', function(d){return d.h;})
                .attr('y', function(d){return d.y;})
                .attr('width', function(d){return d.w;})
                .style('fill', this.dp_settings.plot_settings.text_background_color);

        // add y-gridlines
        this.g_y_gridlines = this.vis.append('g')
            .attr('class', 'primary_gridlines y_gridlines');

        this.y_gridlines = this.g_y_gridlines.selectAll()
            .data(this.y_gridlines_data)
          .enter().append('svg:line')
            .attr('x1', x.range()[0])
            .attr('x2', x.range()[1])
            .attr('y1', function(d){return d;})
            .attr('y2', function(d){return d;})
            .attr('class', 'primary_gridlines y_gridlines');

        // add x-range rectangles for areas of interest
        this.g_rects = this.vis.append('g');
        this.rects_of_interest = this.vis.selectAll('rect.rects_of_interest')
            .data(this.settings.reference_rectangles)
            .enter().append('rect')
                .attr('x', function(d){return x(d.x1);})
                .attr('height', this.h)
                .attr('y', 0).transition().duration(1000)
                .attr('width', function(d){return (x(d.x2)-x(d.x1));})
                .each(apply_styles);

        // draw reference lines
        this.g_reference_lines = this.vis.append('g');
        this.line_reference_lines = self.g_reference_lines.selectAll('line')
                .data(this.settings.reference_lines)
            .enter().append('svg:line')
                .attr('x1', function(v){return x(v.x1);})
                .attr('x2', function(v){return x(v.x2);})
                .attr('y1', 0).transition().duration(1000)
                .attr('y2', this.h)
                .each(apply_styles);

        // draw horizontal-spacer lines
        this.g_spacer_lines = this.vis.append('g');
        this.spacer_lines = self.g_spacer_lines.selectAll('line')
                .data(this.settings.spacer_lines)
            .enter().append('svg:line')
                .attr('x1', -this.text_width-this.padding.left)
                .attr('x2', this.w)
                .attr('y1', function(d){return self.row_heights[d.index].max;})
                .attr('y2', function(d){return self.row_heights[d.index].max;})
                .each(apply_line_styles);

        // Add bars

        // filter bars to include only bars where the difference between low/high
        // is greater than 0
        var bar_half_height = 5,
            bar_rows = this.datarows.filter(function(d){
                return ((d[self.settings.bars.high_field_name]-
                         d[self.settings.bars.low_field_name])>0);
            });

        this.g_bars = this.vis.append('g');
        this.dose_range_horizontal = this.g_bars.selectAll()
                .data(bar_rows)
            .enter().append('svg:line')
                .attr('x1', function(d){return x(d[self.settings.bars.low_field_name]);})
                .attr('x2', function(d){return x(d[self.settings.bars.high_field_name]);})
                .attr('y1', function(d){return self.row_heights[d._dp_index].mid;})
                .attr('y2', function(d){return self.row_heights[d._dp_index].mid;})
                .each(apply_line_styles);

        this.dose_range_lower_vertical = this.g_bars.selectAll()
                .data(bar_rows)
            .enter().append('svg:line')
                .attr('x1', function(d){return x(d[self.settings.bars.low_field_name]);})
                .attr('x2', function(d){return x(d[self.settings.bars.low_field_name]);})
                .attr('y1', function(d){return self.row_heights[d._dp_index].mid + bar_half_height;})
                .attr('y2', function(d){return self.row_heights[d._dp_index].mid - bar_half_height;})
                .each(apply_line_styles);

        this.dose_range_upper_vertical = this.g_bars.selectAll()
            .data(bar_rows)
            .enter().append('svg:line')
                .attr('x1', function(d){return x(d[self.settings.bars.high_field_name]);})
                .attr('x2', function(d){return x(d[self.settings.bars.high_field_name]);})
                .attr('y1', function(d){return self.row_heights[d._dp_index].mid + bar_half_height;})
                .attr('y2', function(d){return self.row_heights[d._dp_index].mid - bar_half_height;})
                .each(apply_line_styles);

        // add points
        this.g_dose_points = this.vis.append('g');
        this.settings.datapoints.forEach(function(datum, i){
            var numeric = self.datarows.filter(
                    function(d){return d[datum.field_name] !== '';});

            self['points_' + i] = self.g_dose_points.selectAll()
                  .data(numeric)
              .enter().append('path')
                  .attr('d', d3.svg.symbol()
                      .size(function(d){return d._styles['points_' + i].size;})
                      .type(function(d){return d._styles['points_' + i].type;}))
                  .attr('transform', (d) => `translate(${x(d[datum.field_name])},${self.row_heights[d._dp_index].mid})`)
                  .each(function(d){
                      var obj = d3.select(this);
                      for (var property in d._styles['points_' + i]) {
                          obj.style(property, d._styles['points_' + i][property]);
                      }
                  })
                  .style('cursor', function(d){return(datum._dpe_key)?'pointer':'auto';})
                  .on('click', function(d){if(datum._dpe_key){self.dpe.render_plottip(datum, d);}});
        });

        this.g_labels = this.vis.append('g');
        this.text_labels = this.g_labels.selectAll('text')
              .data(this.settings.labels)
              .enter().append('text')
              .attr('x', function(d){return d.x;})
              .attr('y', function(d){return d.y;})
              .text(function(d){return d.text;})
              .attr('cursor', cursor)
              .attr('class', 'with_whitespace')
              .each(function(d){apply_text_styles(this, d._style);})
              .call(label_drag);

        this.add_title(this.dp_settings.plot_settings.title_left,
                       this.dp_settings.plot_settings.title_top);
        this.title
            .attr('cursor', cursor)
            .call(title_drag);

        this.build_x_label(this.dp_settings.plot_settings.xlabel_left,
                           this.dp_settings.plot_settings.xlabel_top);

        this.x_axis_label
            .attr('cursor', cursor)
            .call(xlabel_drag);
    }

    layout_text(){
        /*
         * Methodology for laying out a matrix of text in an SVG which requires
         * word-wrap. The working method is as follows. First, layout all text in
         * rows/columns, and get a matrix of objects which contains the element,
         * x-location, y-location, width, and height. Then, find the maximum width
         * in each column, and adjust x-location for each cell by column. Then, for
         * each row, find the maximum height for each row, and adjust the y-location
         * for each cell by column.
         */
        var self = this,
            apply_text_styles = function(obj, styles){
                obj = d3.select(obj);
                for (var property in styles) {
                    obj.style(property, styles[property]);
                }
                if(styles.rotate>0){
                    obj.attr('transform', 'rotate({0} {1},{2})'.printf(
                        styles.rotate, obj.attr('x'), obj.attr('y')));
                }
            },
            matrix =[],
            row,
            textPadding = this.textPadding,
            left = this.padding.left,
            top = this.padding.top,
            min_row_height = this.dp_settings.plot_settings.minimum_row_height,
            heights = [],
            height_offset;
        // build n x m array-matrix of text-component-data (including header, where):
        // n = number of rows, m = number of columns
        matrix = [this.headers];
        this.datarows.forEach(function(v, i){
            row = [];
            self.settings.descriptions.forEach(function(desc, j){
                var txt = v[desc.field_name];
                if($.isNumeric(txt)){
                    if (txt % 1 === 0) txt = parseInt(txt, 10);
                    txt = txt.toHawcString();
                } else {
                    txt = txt.toLocaleString();
                }
                row.push({
                    row: i+1,
                    col: j,
                    text: txt,
                    style: v._styles['text_' + j],
                    cursor: (desc._dpe_key)?'pointer':'auto',
                    onclick(){
                        if(desc._dpe_key){
                            self.dpe.render_plottip(desc, v);
                        }
                    },
                });
            });
            matrix.push(row);
        });

        // naively layout components
        this.g_text_columns = d3.select(this.svg).append('g').attr('class', 'text_g');

        this.text_rows = this.g_text_columns.selectAll('g')
            .data(matrix)
          .enter().append('g')
            .attr('class', 'text_row');

        this.text_rows.selectAll('text')
              .data(function(d) { return d; })
              .enter().append('text')
              .attr('x', 0)
              .attr('y', 0)
              .attr('class', 'with_whitespace')
              .text(function(d){return d.text;})
              .style('cursor', function(d){return d.cursor;})
              .on('click', function(d){return d.onclick();})
              .each(function(d){apply_text_styles(this, d.style);});

        // apply wrap text method
        this.headers.forEach(function(v,i){
            var sel = self.g_text_columns
                  .selectAll('text')
                  .filter(function(v){return v.col===i;});

            if (v.max_width) _.each(sel[0], _.partial(HAWCUtils.wrapText, _, v.max_width));

            // get maximum column dimension and layout columns
            v.widths = d3.max(sel[0].map(function(v){return v.getBBox().width;}));
            sel.each(function(){
                var val = d3.select(this),
                    anchor = val.style('text-anchor');
                if(anchor === 'end'){
                    val.attr('x', left+v.max_width);
                    val.selectAll('tspan').attr('x', left+v.widths);
                } else if (anchor==='middle'){
                    var width = v.max_width || v.widths;  // use max_width in case of overflow
                    val.attr('x', left+width/2);
                    val.selectAll('tspan').attr('x', left+width/2);
                } else { // default: left-aligned
                    val.attr('x', left);
                    val.selectAll('tspan').attr('x', left);
                }
            });
            left += v.widths + 2*textPadding;
        });

        // get maximum row dimension and layout rows
        var merged_row_height,
            extra_space,
            prior_extra = 0,
            text_rows = this.text_rows.selectAll('text'),
            j;

        text_rows.forEach(function(v, i){
            for(j=0; j<v.length; j++){
                var val = d3.select(v[j]);
                val.attr('y', textPadding+top);
                val.selectAll('tspan').attr('y', textPadding+top);
            }

            // get maximum-height of rendered text, and row-height
            var cellHeights = v.map(function(v){return v.getBBox().height;}),
                actual_height = d3.max(cellHeights),
                row_height = d3.max([min_row_height, actual_height]);

            // Peek-ahead and see if other rows are merged with this row; if so we may
            // want to adjust the actual row-height to allow for even spacing.
            // Only check for data rows (not header rows)
            if (i>0 && !self.datarows[i-1]._dp_isMerged){
                var numRows = 1, min_height = 0;
                for(j=i+1; j<self.datarows.length; j++){

                    // the row height should be the maximum-height of a non-merged cell
                    if(j===i+1){
                        text_rows[j]
                            .map(function(v){ return v.getBBox().height; })
                            .forEach(function(d,i){
                                if (d>0) min_height = Math.max(min_height, cellHeights[i]);
                            });
                    }

                    if(!self.datarows[j]._dp_isMerged) break;
                    numRows +=1;
                }
                var extra = (actual_height-min_row_height);
                if (numRows === 1){
                    merged_row_height = actual_height;
                } else if ((extra/numRows)<min_row_height){
                    merged_row_height = min_row_height;
                } else {
                    merged_row_height = min_row_height + extra/numRows;
                }
                row_height = Math.max(min_height, merged_row_height);
            }

            // add spacer if needed
            var spacer = self.settings.spacers['row_' + i];
            extra_space = (spacer && spacer.extra_space) ? min_row_height/2 : 0;

            // get the starting point for the top-row and offset all dimensions from this
            if (i===1) height_offset = top;

            // save object of relative heights of data rows, with-respect to first-data row
            if (i>0){
                heights.push({
                    min: top - height_offset - prior_extra,
                    mid: top - height_offset + textPadding + row_height/2,
                    max: top - height_offset + row_height + 2*textPadding + extra_space,
                });
            }

            //adjust height of next row
            top += row_height + 2*textPadding + 2*extra_space;

            // set for next row
            prior_extra = extra_space;
        });

        // remove blank text elements; can mess-up size calculations
        $(
            _.filter(
                this.g_text_columns.selectAll('text')[0],
                    function(d){return d.textContent.length===0;}
            )
        ).remove();

        // calculate plot-height, text-width, and save heights array
        var textDim = this.g_text_columns.node().getBBox();
        this.text_width = textDim.width + textDim.x;
        this.h = heights[heights.length-1].max;
        this.row_heights = heights;
    }

    layout_plot(){
      // Top-location to equal to the first-data row
      // Left-location to equal size of text plus left-padding
        var headerDims = this.g_text_columns.selectAll('g')[0][1].getBBox(),
            top = headerDims.y-this.textPadding,
            textDims = this.g_text_columns.node().getBBox(),
            left = textDims.width + textDims.x + this.padding.left;

        this.vis.attr('transform', `translate(${left},${top})`);
        this.vis.select('.dp_bg').attr('height', this.h);

        // resize SVG to account for new size
        var svgDims = this.svg.getBBox(),
            w = svgDims.width  + svgDims.x + this.padding.right,
            h = svgDims.height + svgDims.y + this.padding.bottom;

        d3.select(this.svg)
          .attr('width', w)
          .attr('height', h)
          .attr('viewBox', '0 0 {0} {1}'.printf(w, h));

        this.full_width = w;
        this.full_height = h;
    }
}

export default DataPivotVisualization;
