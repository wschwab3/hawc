var AggregationVersions = function(obj, revision_version){
    // implements requirements for js/hawc_utils Version interface
    // unpack JSON object into Assessment
    for (var i in obj) {this[i] = obj[i];}
    // convert datetime formats
    this.created = new Date(this.created);
    this.last_updated = new Date(this.last_updated);
    this.revision_version = revision_version;
    this.banner = this.revision_version + ': ' + String(this.last_updated) + ' by ' + this.changed_by;
};


AggregationVersions.field_order = ['name', 'aggregation_type', 'endpoints',
                                   'summary_text', 'created', 'last_updated'];


var Aggregation = function(endpoints, name, options){
    /* - endpoints are an array of Endpoint objects.
       - name is the string name.
       - options include:
        {
         "build_table_startup": true/false,
         "$tbl_div" : $jQuery div,
         "build_plot_startup": true/false,
         "$plot_div" : $jQuery div
        }
     */
    this.endpoints = endpoints;
    this.name = name;
    this.options = options || {};
    if (this.options.build_table_startup){this.build_table();}
    if (this.options.build_plot_startup){this.build_plot();}
};

Aggregation.get_object = function(pk, callback, options){
    $.get('/ani/aggregation/{0}/json/'.printf(pk), function(d){
        var endpoints = [];
        d.endpoints.forEach(function(v){endpoints.push(new Endpoint(v));});
        callback(new Aggregation(endpoints, d.name, options));
    });
};

Aggregation.prototype.build_table = function($tbl_div){
    var self = this;
    this.table_style = [POD_table, Evidence_table];
    this.$tbl_div = $tbl_div || this.options.$tbl_div;
    this.table = new this.table_style[0](this, this.$tbl_div);
    $('body').on('click','#table_toggle',
        function(){self.toggle_table_views();});
};

Aggregation.prototype.build_plot = function($plot_div){
    if($plot_div) this.options.$plot_div=$plot_div;
    this.plot = new AggPlot(this, this.options.$plot_div);
};

Aggregation.prototype.toggle_table_views = function(){
    this.table_style.unshift(this.table_style.pop());
    this.table = new this.table_style[0](this, this.$tbl_div);
};

Aggregation.prototype.get_name = function(){
    return this.name;
};


POD_table = function(aggregation, tbl_id){
    /* Point-of-departure tables are used to present the key values used in a an
     * assessment for derivation of a point-of-departure. This may include the
     * LOAEL, NOAEL, and selected BMDL, if modeling was conducted.
     */
    this.parent = aggregation;
    this.tbl = $(tbl_id);
    this.headers = ['Study', 'Experiment', 'Animal Group',
                    'Endpoint', 'NOAEL', 'LOAEL', 'BMD', 'BMDL'];
    this.build_table();
};

POD_table.prototype.build_table = function(){
    var tbl = $('<table class="table table-compresed table-hover"></table>');
    tbl.append(this._build_header());
    tbl.append(this._build_body());
    this.tbl.html(tbl);
    this._set_event_handlers();
};

POD_table.prototype._build_header = function(){
    var tr = $('<tr></tr>');
    this.headers.forEach(function(v){
        var td = $('<th>' + v +'</th>');
        tr.append(td);
    });
    return $('<thead></thead>').append(tr);
};

POD_table.prototype._build_body = function(){
    var t = this,
        tbody = $('<tbody></tbody>');
    this.parent.endpoints.forEach(function(v,i){
        tbody.append(t._build_body_row(v, i));
    });
    return tbody;
};

POD_table.prototype._build_body_row = function(endpoint, counter){
    var tr = $('<tr></tr>').data('endpoint', endpoint);
    tr.append('<td><a href="{0}">{1}</a></td>'.printf(endpoint.data.study.study_url, endpoint.data.study.short_citation),
              '<td><a href="{0}">{1}</a></td>'.printf(endpoint.data.experiment_url, endpoint.data.experiment),
              '<td><a href="{0}">{1}</a></td>'.printf(endpoint.data.animal_group_url, endpoint.data.animal_group),
              endpoint._endpoint_detail_td(),
              '<td>{0}</td>'.printf(endpoint.get_special_dose_text('NOAEL')),
              '<td>{0}</td>'.printf(endpoint.get_special_dose_text('LOAEL')),
              '<td>{0}</td>'.printf(endpoint.get_bmd_special_values('BMD')),
              '<td>{0}</td>'.printf(endpoint.get_bmd_special_values('BMDL')));
    return tr;
};

POD_table.prototype._set_event_handlers = function(){
    var self = this;
    this.tbl.on('click', '.endpoint-selector', function(e){
        e.preventDefault();
        var tr = $(this).parent().parent();
        if (tr.data('detail_row')){
             tr.data('detail_row').toggle_view(!tr.data('detail_row').object_visible);
        } else {
            var endpoint = tr.data('endpoint'),
                div_id = String.random_string();
            $(this).parent().parent().after('<tr><td colspan="{0}"><div id="{1}"></div></td></tr>'.printf(9, div_id));
            tr.data('detail_row', new EndpointDetailRow(endpoint, '#'+div_id, 1));
        }
    });
};


AnimalGroup_table = function(aggregation, tbl_selector){
    /*
     * AnimalGroup table presents a list of dose-response data for each endpoint
     * in the aggregation. Because all animals in an animal-group use the same
     * dosing-regime, no checking is done to ensure that the doses are consistent.
     * However, checking is conducted to ensure that the "N" is constant across
     * endpoints.
     */
    this.aggregation = aggregation;
    this.tbl = $(tbl_selector);
    this.footnotes = new TableFootnotes();
    if (this.aggregation.endpoints.length>0) this.build_table();
};

AnimalGroup_table.prototype.build_table = function(){
    this.footnotes.reset();
    var thead = this._build_header(),
        tbody = this._build_body(),
        tfoot = this._build_footer(),
        tbl = $('<table class="table table-hover table-condensed"></table>')
                .append([thead, tfoot, tbody]);
    this.tbl.html(tbl);
    this._set_event_handlers();
};

AnimalGroup_table.prototype._set_event_handlers = function(){
    var self = this;

    // create a new div below the selected row
    this.tbl.on('click', '.endpoint-selector', function(e){
        e.preventDefault();
        var tr = $(this).parent().parent();
        if (tr.data('detail_row')){
             tr.data('detail_row').toggle_view(!tr.data('detail_row').object_visible);
        } else {
            var endpoint = tr.data('endpoint'),
                div_id = String.random_string();
            $(this).parent().parent()
                .after('<tr><td colspan="10"><div id="{1}"></div></td></tr>'
                .printf(self.columns_count, div_id));
            tr.data('detail_row', new EndpointDetailRow(endpoint, '#'+div_id, 1));
        }
    });
};

AnimalGroup_table.prototype._build_header = function(){
    var doses = this.aggregation.endpoints[0]._build_animal_group_dose_rows();
    this.columns_count = doses.columns_count;
    return $('<thead></thead>').append(doses.html);
};

AnimalGroup_table.prototype._build_body = function(){
    var tbody = $('<tbody></tbody>'), row, self=this;
    this._determine_endpoint_order();
    this.n_groups_order.forEach(function(v1, i1){
        tbody.append(self.n_groups[v1].endpoints[0]._build_animal_group_n_row());
        self.n_groups[v1].endpoints.forEach(function(v2,i2){
            tbody.append(v2._build_animal_group_response_row(self.footnotes));
        });
    });
    return tbody;
};

AnimalGroup_table.prototype._build_footer = function(){
    var txt = this.footnotes.html_list().join('<br>');
    return $('<tfoot><tr><td colspan="{0}">{1}</td></tr></tfoot>'.printf(this.columns_count, txt));
};

AnimalGroup_table.prototype._determine_endpoint_order = function(){
    /* In most cases, all endpoints will have the same number of animals. However,
     * in the event that the number of animals is different, we order to the
     * endpoints to only print the number of animal rows where this information
     * changes.
     */
    var n_groups = {};
    //Bin endpoints by unique animal group counts
    this.aggregation.endpoints.forEach(function(v){
        var n_str = v._number_of_animals_string();
        if (n_groups[n_str]){
            n_groups[n_str].endpoints.push(v);
            n_groups[n_str].count += 1;
        } else {
            n_groups[n_str] = {count:1, endpoints:[v]};
        }
    });
    //Next, sort n-bins by the count of endpoints in descending order
    var sortable = [];
    for (var n in n_groups)
        sortable.push([n, n_groups[n].count]);
    sortable.sort(function(a, b) {return b[1] - a[1];});

    this.n_groups = n_groups;
    this.n_groups_order = sortable.map(function(v){return v[0];});
};


Evidence_table = function(aggregation, tbl_id){
    /*
     * Evidence tables are an aggregation of existing dose-response tables. They
     * consist of a table with individual subtables, each of which presents the
     * dose-response information for a endpoint. Each row is essentially
     * independent.
     */
    this.parent = aggregation;
    this.tbl = $(tbl_id);
    this.headers = ['Study', 'Experiment', 'Animal Group', 'Endpoint'];
    this.build_table();
};

Evidence_table.prototype.build_table = function(){
    var tbl = $('<table class="table table-compresed table-hover"></table>');
    tbl.append(this._build_header());
    tbl.append(this._build_body());
    this.tbl.html(tbl);
};

Evidence_table.prototype._build_header = function(){
    var tr = $('<tr></tr>');
    this.headers.forEach(function(v){
        var td = $('<th>' + v +'</th>');
        tr.append(td);
    });
    return $('<thead></thead>').append(tr);
};

Evidence_table.prototype._build_body = function(){
    var t = this,
        tbody = $('<tbody></tbody>');
    this.parent.endpoints.forEach(function(v,i){
        tbody.append(t._build_body_row(v, i));
    });
    return tbody;
};

Evidence_table.prototype._build_body_row = function(endpoint, counter){
    var endpoint_table_td = $('<td></td>')
            .append('<h4><a href="{0}">{1}</a></h4>'.printf(endpoint.data.url, endpoint.data.name))
            .append(endpoint.build_endpoint_table($('<table class="table table-condensed table-striped"></table>'))),
        content = ['<td><a href="{0}">{1}</a></td>'.printf(endpoint.data.study.study_url, endpoint.data.study.short_citation),
                   '<td><a href="{0}">{1}</a></td>'.printf(endpoint.data.experiment_url, endpoint.data.experiment),
                   '<td><a href="{0}">{1}</a></td>'.printf(endpoint.data.animal_group_url, endpoint.data.animal_group),
                   endpoint_table_td];
    return $('<tr></tr>').html(content);
};


var AggPlot = function(aggregation, plot_id){
    this.aggregation = aggregation;
    this.plot_div = $(plot_id);
    this.plot_id = plot_id;
    var options = {'build_plot_startup': false};
    this.plot_style = [new Forest_plot(aggregation, plot_id, options, this),
                       new ERH_plot(aggregation, plot_id, options, this)];
    this.toggle_plot_views();
};

AggPlot.prototype.toggle_plot_views = function(){
    // change the current plot style
    this.plot_style.unshift(this.plot_style.pop());
    this.plot = this.plot_style[0];
    this.plot.build_plot();
};

AggPlot.prototype.add_toggle_button = function(plot){
    // add toggle to menu options to view other ways
    var aggplot = this;
    var options = {id:'plot_toggle',
                   cls: 'btn btn-mini',
                   title: 'View alternate visualizations',
                   text: '',
                   icon: 'icon-circle-arrow-right',
                   on_click: function(){aggplot.toggle_plot_views();}};
   plot.add_menu_button(options);
};


ERH_plot = function(aggregation, plot_id, options, parent){
    D3Plot.call(this); // call parent constructor
    this.parent = parent;
    this.options = options;
    this.aggregation = aggregation;
    this.plot_div = $(plot_id);
    this.plottip = new PlotTooltip({"width": "500px", "height": "380px"});
    this.set_defaults();
    this.default_x_scale = options.default_x_scale || 'log';
    if(this.options.build_plot_startup){this.build_plot();}
};

ERH_plot.prototype = new D3Plot();
ERH_plot.prototype.constructor = ERH_plot;

ERH_plot.prototype.build_plot = function(){
    this.plot_div.html('');
    this.get_plot_sizes();
    this.get_dataset_info();
    this.build_plot_skeleton(true);
    this.add_title();
    this.add_axes();
    this.build_x_label();
    this.build_y_label();
    this.add_dose_lines();
    this.add_dose_points();
    this.add_final_rectangle();
    this.add_legend();
    this.customize_menu();
    var plot = this;
    this.x_axis_label.on("click", function(v){plot.toggle_x_axis();});
    this.resize_plot_dimensions();
    this.trigger_resize();
};

ERH_plot.prototype.customize_menu = function(){
    this.add_menu();
    if (this.parent){this.parent.add_toggle_button(this);}
    var plot = this;
    var options = {id:'toggle_x_axis',
                   cls: 'btn btn-mini',
                   title: 'Change x-axis scale (shortcut: click the x-axis label)',
                   text: '',
                   icon: 'icon-resize-horizontal',
                   on_click: function(){plot.toggle_x_axis();}};
   this.add_menu_button(options);
};

ERH_plot.prototype.toggle_x_axis= function(){
    if(window.event && window.event.stopPropagation){event.stopPropagation();}
    if (this.x_axis_settings.scale_type == 'linear'){
        this.x_axis_settings.scale_type = 'log';
        this.x_axis_settings.number_ticks = 1;
        var formatNumber = d3.format(",.f");
        this.x_axis_settings.label_format = formatNumber;
    } else {
        this.x_axis_settings.scale_type = 'linear';
        this.x_axis_settings.number_ticks = 10;
        this.x_axis_settings.label_format = undefined;
    }
    this.update_x_domain();
    this.x_scale = this._build_scale(this.x_axis_settings);
    this.x_axis_change_chart_update();
};

ERH_plot.prototype.x_axis_change_chart_update = function(){
    // Assuming the plot has already been constructed once,
    // rebuild plot with updated x-scale.
    var x = this.x_scale;

    this.rebuild_x_axis();
    this.rebuild_x_gridlines({animate: true});

    //rebuild dosing lines
    this.dosing_lines.selectAll("line")
        .transition()
        .duration(1000)
        .attr("x1", function(d) { return x(d.x_lower);})
        .attr("x2", function(d) { return x(d.x_upper); });

    this.dots
        .transition()
        .duration(1000)
        .attr('cx', function(d){return x(d.x);});
};

ERH_plot.prototype.get_plot_sizes = function(){
    this.w = this.plot_div.width() - this.padding.right - this.padding.left - 20; // extra for margins
    this.h = this.aggregation.endpoints.length*40;
    this.plot_div.css({'height': (this.h + this.padding.top + this.padding.bottom + 45) + 'px'}); // extra for toolbar
};

ERH_plot.prototype.resize_plot_dimensions = function(){
    // Resize plot based on the dimensions of the labels.
    var ylabel_width = this.vis.select('.y_axis').node().getBoundingClientRect().width;
    if (this.padding.left < this.padding.left_original + ylabel_width){
        this.padding.left = this.padding.left_original + ylabel_width;
        this.build_plot();
    }
};

ERH_plot.prototype.set_defaults = function(){
    this.padding = {top:40, right:20, bottom:40, left:25};
    this.padding.left_original = this.padding.left;
    this.buff = 0.05; // addition numerical-spacing around dose/response units

    var formatNumber = d3.format(",.f");
    this.x_axis_settings = {
        scale_type: this.options.default_x_axis || 'log',
        text_orient: "bottom",
        axis_class: 'axis x_axis',
        gridlines: true,
        gridline_class: 'primary_gridlines x_gridlines',
        number_ticks: 10,
        axis_labels: true,
        label_format: formatNumber
    };

    this.y_axis_settings = {
        scale_type: 'ordinal',
        text_orient: 'left',
        axis_class: 'axis y_axis',
        gridlines: true,
        gridline_class: 'primary_gridlines y_gridlines',
        axis_labels: true,
        label_format: undefined //default
    };
};

ERH_plot.prototype.get_dataset_info = function(){
    // space lines in half-increments
    this.min_y = 0;
    this.max_y = this.aggregation.endpoints.length;

    var min = Infinity,
        max = -Infinity,
        default_x_scale = this.default_x_scale,
        lines_data = [],
        points_data = [];

    this.aggregation.endpoints.forEach(function(v, i){
        if (v.data.dr.length>0){
            // get min/max information
            if (default_x_scale == "log"){
                min = Math.min(min, v.data.dr[1].dose);
            } else {
                min = Math.min(min, v.data.dr[0].dose);
            }
            max = Math.max(max, v.data.dr[v.data.dr.length-1].dose);
            if (isFinite(v.get_bmd_special_values('BMDL'))) {
                min = Math.min(min, v.get_bmd_special_values('BMDL'));
                max = Math.max(max, v.get_bmd_special_values('BMDL'));
            }

            //setup lines information for dose-response line (excluding control)
            lines_data.push({y: v.data.pk,
                             name: v.data.study.short_citation + "- " + v.data.animal_group + ": " + v.data.name,
                             x_lower: v.data.dr[1].dose,
                             x_upper: v.data.dr[v.data.dr.length-1].dose});

            // setup points information

            // add LOAEL/NOAEL
            v.data.dr.forEach(function(v2,i2){
                txt = [v.data.study.short_citation,
                       v.data.name,
                       'Dose: ' + v2.dose,
                       'N: ' + v2.n];
                if (v2.dose>0){
                    if (v.data.data_type == 'C'){
                        txt.push('Mean: ' + v2.response, 'Stdev: ' + v2.stdev);
                    } else {
                        txt.push('Incidence: ' + v2.incidence);
                    }
                    coords = {endpoint:v,
                              x:v2.dose,
                              y:v.data.pk,
                              classes:'',
                              text: txt.join('\n')};
                    if (v.data.LOAEL == i2){ coords.classes='LOAEL';}
                    if (v.data.NOAEL == i2){ coords.classes='NOAEL';}
                    points_data.push(coords);
                }
            });
            // add BMDL
            if (isFinite(v.get_bmd_special_values('BMDL'))) {
                txt = [v.data.study.short_citation,
                       v.data.name,
                       'BMD Model: ' + v.data.BMD.outputs.model_name,
                       'BMD: ' + v.data.BMD.outputs.BMD + ' (' + v.data.dose_units + ')',
                       'BMDL: ' +v.data.BMD.outputs.BMDL + ' (' + v.data.dose_units + ')'];
                points_data.push({endpoint:v,
                                  x: v.get_bmd_special_values('BMDL'),
                                  y: v.data.pk,
                                  classes: 'BMDL',
                                  text : txt.join('\n')});
            }
        }
    });
    this.lines_data = lines_data;
    this.points_data = points_data;
    this.min_x = min;
    this.max_x = max;

    this.title_str = this.aggregation.name;
    this.x_label_text = "Dose ({0})".printf(this.aggregation.endpoints[0].data.dose_units);
    this.y_label_text = 'Endpoints';
};

ERH_plot.prototype.add_axes = function() {
    // using plot-settings, customize axes
    this.update_x_domain();
    $.extend(this.x_axis_settings, {
        rangeRound: [0, this.w],
        x_translate: 0,
        y_translate: this.h
    });

    $.extend(this.y_axis_settings, {
        domain: this.lines_data.map(function(d) {return d.y;}),
        rangeRound: [0, this.h],
        number_ticks: this.aggregation.endpoints.length,
        x_translate: 0,
        y_translate: 0
    });
    this.build_x_axis();
    this.build_y_axis();

    var lines_data = this.lines_data;
    d3.selectAll('.y_axis text')
        .text(function(v, i){
            var name;
            lines_data.forEach(function(endpoint){
                if (v === endpoint.y) {
                    name = endpoint.name;
                    return;
                }
            });
            return name;
        });
};

ERH_plot.prototype.update_x_domain = function(){
    var domain_value;
    if (this.x_axis_settings.scale_type === 'linear'){
        domain_value = [this.min_x-this.max_x*this.buff, this.max_x*(1+this.buff)];
    } else {
        domain_value = [this.min_x, this.max_x];
    }
    this.x_axis_settings.domain = domain_value;
};

ERH_plot.prototype.add_dose_lines = function(){
    var x = this.x_scale,
        y = this.y_scale,
        halfway = y.rangeBand()/2;

    this.dosing_lines = this.vis.append("g");
    this.dosing_lines.selectAll("line")
        .data(this.lines_data)
      .enter().append("line")
        .attr("x1", function(d) { return x(d.x_lower); })
        .attr("y1", function(d) {return y(d.y)+halfway;})
        .attr("x2", function(d) { return x(d.x_upper); })
        .attr("y2", function(d) {return y(d.y)+halfway;})
        .attr('class','dr_err_bars'); // todo: rename class to more general name
};

ERH_plot.prototype.add_dose_points = function(){

    var x = this.x_scale,
        y = this.y_scale,
        self = this,
        tt_width = 400,
        halfway = y.rangeBand()/2;

    var tooltip = d3.select("body")
        .append("div")
        .attr('class', 'd3modal')
        .attr('width', tt_width + 'px')
        .style("position", "absolute")
        .style("z-index", "1000")
        .style("visibility", "hidden")
        .on('click', function(){$(this).css('visibility','hidden');});
    this.tooltip = $(tooltip[0]);

    this.dots_group = this.vis.append("g");
    this.dots = this.dots_group.selectAll("circle")
        .data(this.points_data)
      .enter().append("circle")
        .attr("r","7")
        .attr("class", function(d){ return "dose_points " + d.classes;})
        .attr("cursor", "pointer")
        .attr("cx", function(d){return x(d.x);})
        .attr("cy", function(d){return y(d.y)+halfway;})
        .on('click', function(v){self.plottip.display_endpoint(v.endpoint, d3.event);});

    // add the outer element last
    this.dots.append("svg:title").text(function(d) { return d.text; });
};

ERH_plot.prototype.add_legend = function(){
    var legend_settings = {};
    legend_settings.items = [{'text':'Doses in Study', 'classes':'dose_points', 'color':undefined}];
    if (this.plot_div.find('.LOAEL').length > 0) { legend_settings.items.push({'text':'LOAEL', 'classes':'LOAEL', 'color':undefined}); }
    if (this.plot_div.find('.NOAEL').length > 0) { legend_settings.items.push({'text':'NOAEL', 'classes':'NOAEL', 'color':undefined}); }
    if (this.plot_div.find('.BMDL').length > 0) { legend_settings.items.push({'text':'BMDL', 'classes':'BMDL', 'color':undefined}); }
    legend_settings.item_height = 20;
    legend_settings.box_w = 110;
    legend_settings.box_h = legend_settings.items.length*legend_settings.item_height;
    legend_settings.box_l = this.w + this.padding.right - legend_settings.box_w - 10;
    legend_settings.dot_r = 5;
    legend_settings.box_t = 10-this.padding.top;
    legend_settings.box_padding = 5;
    this.build_legend(legend_settings);
};


Forest_plot = function(aggregation, plot_id, options, parent){
    D3Plot.call(this); // call parent constructor
    this.parent = parent;
    this.options = options;
    this.aggregation = aggregation;
    this.plot_div = $(plot_id);
    this.set_defaults();
    this.plottip = new PlotTooltip({"width": "500px", "height": "380px"});
    this.default_y_scale = options.default_y_scale || 'linear';
    if(this.options.build_plot_startup){this.build_plot();}
};

Forest_plot.prototype = new D3Plot();
Forest_plot.prototype.constructor = Forest_plot;

Forest_plot.prototype.build_plot = function(){
    this.plot_div.html('');
    this.get_dataset_info();
    this.build_plot_skeleton(true);
    this.add_title();
    this.add_axes();
    this.add_endpoint_lines();
    this.add_dose_points();
    this.add_axis_text();
    this.add_final_rectangle();
    this.build_x_label();
    this.build_y_label();
    this.add_legend();
    this.customize_menu();
    this.resize_plot_dimensions();
    this.trigger_resize();
};

Forest_plot.prototype.set_defaults = function(){
    this.padding = {top:40, right:20, bottom:40, left:30};
    this.padding.left_original = this.padding.left;
    this.buff = 0.05; // addition numerical-spacing around dose/reponse units
};

Forest_plot.prototype.customize_menu = function(){
    this.add_menu();
    if (this.parent){this.parent.add_toggle_button(this);}
};

Forest_plot.prototype.get_dataset_info = function(){

    // get datasets to plot
    var points = [],
        lines = [],
        endpoint_labels = [],
        y = 0, val, control, lower_ci, upper_ci;

    this.aggregation.endpoints.forEach(function(v1,i1){
        if (v1.data.dr.length>0){
            // and endpoint label
            endpoint_labels.push({y:((y+y+v1.data.dr.length)/2),
                                  label:v1.data.study.short_citation + "- " + v1.data.animal_group + ": " + v1.data.name});

            v1.data.dr.forEach(function(v2,i2){
                txt = [v1.data.study.short_citation,
                       v1.data.name,
                       'Dose: ' + v2.dose,
                       'N: ' + v2.n];

               if (i2 === 0){
                    // get control value
                    if (v1.data.data_type == 'C'){
                        control = parseFloat(v2.response);
                    } else {
                        control = parseFloat(v2.incidence / v2.n);
                    }
                    if (control === 0){control = 1e-10;}
                }

                // get plot value
                y += 1;
                if (v1.data.data_type == 'C'){
                    txt.push('Mean: ' + v2.response, 'Stdev: ' + v2.stdev);
                    val = (v2.response - control) / control;
                    lower_ci = (v2.lower_limit - control) / control; // todo this is likely incorrect
                    upper_ci = (v2.upper_limit - control) / control;
                } else {
                    txt.push('Incidence: ' + v2.incidence);
                    val = v2.incidence / v2.n;
                    lower_ci = v2.lower_limit; // todo this is likely incorrect
                    upper_ci = v2.upper_limit;
                }
                var coords = {'x':val, 'y':y, 'class':'', 'text': txt.join('\n'), 'dose': v2.dose,
                              'lower_ci': lower_ci, 'upper_ci': upper_ci, 'endpoint': v1};
                if (v1.data.LOAEL == i2){ coords.class='LOAEL';}
                if (v1.data.NOAEL == i2){ coords.class='NOAEL';}
                points.push(coords);
            });
            y+=1;
            lines.push({'y': y, 'endpoint': v1.data.name});
        }
    });

    // remove final line
    lines.pop();
    y-=1;

    this.points = points;
    this.lines = lines;
    this.endpoint_labels = endpoint_labels;

    // get axis bounds
    this.min_x = d3.min(points, function(v){return v.lower_ci;});
    this.max_x = d3.max(points, function(v){return v.upper_ci;});

    this.min_y = 0;
    this.max_y = y+=1;

    this.w = this.plot_div.width() - this.padding.right - this.padding.left; // plot width
    this.h = this.points.length*18; //plot height
    this.plot_div.css({'height': (this.h + this.padding.top + this.padding.bottom + 45) + 'px'});

    this.title_str = this.aggregation.name;
    this.x_label_text = "% change from control (continuous), % incidence (dichotomous)";
    this.y_label_text = "Doses ({0})".printf(this.aggregation.endpoints[0].data.dose_units);
};

Forest_plot.prototype.add_axes = function() {
    // using plot-settings, customize axes
    this.x_axis_settings = {
        'scale_type': 'linear',
        'domain': [this.min_x-this.max_x*this.buff, this.max_x*(1+this.buff)],
        'rangeRound': [0, this.w],
        'text_orient': "bottom",
        'x_translate': 0,
        'y_translate': this.h,
        'axis_class': 'axis x_axis',
        'gridlines': true,
        'gridline_class': 'primary_gridlines x_gridlines',
        'number_ticks': 10,
        'axis_labels':true,
        'label_format':d3.format(".0%")
    };

    this.y_axis_settings = {
        'scale_type': 'linear',
        'domain': [this.min_y, this.max_y],
        'rangeRound': [this.h, 0],
        'text_orient': "left",
        'x_translate': 0,
        'y_translate': 0,
        'axis_class': 'axis y_axis',
        'gridlines': false,
        'gridline_class': 'primary_gridlines y_gridlines',
        'number_ticks': 10,
        'axis_labels':false,
        'label_format':undefined //default
    };
    this.build_x_axis();
    this.build_y_axis();
};

Forest_plot.prototype.resize_plot_dimensions = function(){
    // Resize plot based on the dimensions of the labels.
    var ylabel_width = d3.max(this.plot_div.find('.forest_plot_labels').map(
                              function(){return this.getComputedTextLength();})) +
                       d3.max(this.plot_div.find('.dr_tick_text').map(
                              function(){return this.getComputedTextLength();}));
    if (this.padding.left < this.padding.left_original + ylabel_width){
        this.padding.left = this.padding.left_original + ylabel_width;
        this.build_plot();
    }
};

Forest_plot.prototype.add_endpoint_lines = function(){
    // horizontal line separators between endpoints
    var x = this.x_scale,
        y = this.y_scale,
        lower = [],
        upper = [];

    //horizontal lines
    this.vis.selectAll("svg.endpoint_lines")
        .data(this.lines)
      .enter().append("line")
        .attr("x1", function(d) { return x(x.domain()[0]); })
        .attr("y1", function(d) { return y(d.y); })
        .attr("x2", function(d) { return x(x.domain()[1]); })
        .attr("y2", function(d) { return y(d.y); })
        .attr('class','primary_gridlines');

    // add vertical line at zero
    this.vis.append("line")
        .attr("x1", this.x_scale(0))
        .attr("y1", this.y_scale(this.min_y))
        .attr("x2", this.x_scale(0))
        .attr("y2", this.y_scale(this.max_y))
        .attr('class','reference_line');
};

Forest_plot.prototype.add_dose_points = function(){

    var x = this.x_scale,
        y = this.y_scale,
        self = this;

    // horizontal confidence interval line
    this.vis.selectAll("svg.error_bars")
        .data(this.points)
      .enter().append("line")
        .attr("x1", function(d) { return x(d.lower_ci); })
        .attr("y1", function(d) { return y(d.y); })
        .attr("x2", function(d) { return x(d.upper_ci); })
        .attr("y2", function(d) { return y(d.y); })
        .attr('class','dr_err_bars');

    // lower vertical vertical confidence intervals line
    this.vis.selectAll("svg.error_bars")
        .data(this.points)
      .enter().append("line")
        .attr("x1", function(d) { return x(d.lower_ci); })
        .attr("y1", function(d) { return y(d.y)-5; })
        .attr("x2", function(d) { return x(d.lower_ci); })
        .attr("y2", function(d) {return y(d.y)+5; })
        .attr('class','dr_err_bars');

    // upper vertical confidence intervals line
    this.vis.selectAll("svg.error_bars")
        .data(this.points)
      .enter().append("line")
        .attr("x1", function(d) { return x(d.upper_ci); })
        .attr("y1", function(d) { return y(d.y)-5; })
        .attr("x2", function(d) { return x(d.upper_ci); })
        .attr("y2", function(d) {return y(d.y)+5; })
        .attr('class','dr_err_bars');

    // central tendency of percent-change
    this.dots = this.vis.selectAll("path.dot")
        .data(this.points)
      .enter().append("circle")
        .attr("r","7")
        .attr("class", function(d){ return "dose_points " + d.class;})
        .attr("transform", function(d) { return "translate(" + x(d.x) + "," + y(d.y) + ")"; })
        .on('click', function(v){self.plottip.display_endpoint(v.endpoint, d3.event);});

    // add the outer element last
    this.dots.append("svg:title").text(function(d) { return d.text; });
};

Forest_plot.prototype.add_axis_text = function(){
    // Next set labels on axis
    var y_scale = this.y_scale, x_scale = this.x_scale;
    this.y_dose_text = this.vis.selectAll("y_axis.text")
        .data(this.points)
    .enter().append("text")
        .attr("x", -5)
        .attr("y", function(v,i){return y_scale(v.y);})
        .attr("dy", "0.5em")
        .attr('class','dr_tick_text')
        .attr("text-anchor", "end")
        .text(function(d,i) { return d.dose;});

    this.labels = this.vis.selectAll("y_axis.text")
        .data(this.endpoint_labels)
    .enter().append("text")
        .attr("x", -this.padding.left+25)
        .attr("y", function(v,i){return y_scale(v.y);})
        .attr('class','dr_title forest_plot_labels')
        .attr("text-anchor", "start")
        .text(function(d,i) { return d.label;});
};

Forest_plot.prototype.add_legend = function(){
    var legend_settings = {};
    legend_settings.items = [{'text':'Doses in Study', 'classes':'dose_points', 'color':undefined}];
    if (this.plot_div.find('.LOAEL').length > 0) { legend_settings.items.push({'text':'LOAEL', 'classes':'LOAEL', 'color':undefined}); }
    if (this.plot_div.find('.NOAEL').length > 0) { legend_settings.items.push({'text':'NOAEL', 'classes':'NOAEL', 'color':undefined}); }
    if (this.plot_div.find('.BMDL').length > 0) { legend_settings.items.push({'text':'BMDL', 'classes':'BMDL', 'color':undefined}); }
    legend_settings.item_height = 20;
    legend_settings.box_w = 110;
    legend_settings.box_h = legend_settings.items.length*legend_settings.item_height;
    legend_settings.box_l = this.w + this.padding.right - legend_settings.box_w - 10;
    legend_settings.dot_r = 5;
    legend_settings.box_t = 10-this.padding.top;
    legend_settings.box_padding = 5;
    this.build_legend(legend_settings);
};