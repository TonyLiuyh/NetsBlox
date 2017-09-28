const ApiConsumer = require('../utils/api-consumer'),
    rpcUtils = require('../utils'),
    gnuPlot = require('./node-gnuplot.js'),
    _ = require('lodash');

let chart = new ApiConsumer('chart');

const defaults = {
    title: undefined,
    labels: [],
    types: [],
    xRange: [],
    yRange: [],
    xLabel: undefined,
    yLabel: undefined,
    xTicks: undefined,
    smooth: 'false',
    isTimeSeries: 'false',
    timeInputFormat: '%s',
    timeDisplayFormat: '%H:%M'
};

// calculates data stats
function calcRanges(lines){
    let stats = {
        x: {
            min: Number.MAX_VALUE, max: -1 * Number.MAX_VALUE
        }, 
        y: {
            min: Number.MAX_VALUE, max: -1 * Number.MAX_VALUE
        }
    };
    lines.forEach(line => {
        // min max of x
        line = _.sortBy(line, (pt => pt[0]));
        let {0 : xmin ,length : l, [l - 1] : xmax} = line.map(pt => pt[0]);
        // min max of y
        line = _.sortBy(line, (pt => pt[1]));
        let {0 : ymin , [l - 1] : ymax} = line.map(pt => pt[1]);
        if( xmin < stats.x.min ) stats.x.min = xmin;
        if( xmax > stats.x.max ) stats.x.max = xmax;
        if( ymin < stats.y.min ) stats.y.min = ymin;
        if( ymax > stats.y.max ) stats.y.max = ymax;
    });
    Object.keys(stats).forEach( key => {
        stats[key].range = stats[key].max - stats[key].min;
    });
    return stats;
}

function prepareData(input) {
    // if the input is one line convert it to appropriate format
    if (! Array.isArray(input[0][0])){
        chart._logger.trace('one line input detected');
        input = [input];
    }
    input = input.map( line => {
        if (!Array.isArray(line)) {
            chart._logger.warn('input is not an array!', line);
            throw 'chart input is not an array';
        }
        line.map(pt => {
            let [x,y] = pt;
            if (!Array.isArray(pt)) {
                chart._logger.warn('input is not an array!', pt);
                throw 'all input points should be in [x,y] form.';
            }
            pt[0] = parseFloat(pt[0]);
            pt[1] = parseFloat(pt[1]);
            if ( !x || !y || isNaN(x) || isNaN(y) ) throw 'all [x,y] pairs should be numbers';
            return pt;
        });
        return line;
    });
    return input;
}


// generate gnuplot friendly line objects
function genGnuData(lines, lineTitles, lineTypes, smoothing){
    return lines.map((pts, idx) => {
        pts = _.sortBy(pts, (pt => pt[0]));
        let lineObj = {points: pts};
        if (lineTypes) lineObj.type = lineTypes[idx];
        if (lineTitles) lineObj.title = lineTitles[idx];
        if (smoothing) lineObj.smoothing = 'csplines';
        return lineObj;
    });
}

chart.draw = function(lines, options){
    options = _.fromPairs(options);
    Object.keys(options).forEach(key => {
        if (options[key] === 'null' || options[key] === ''){
            delete options[key];
        }
    });
    options = _.merge({}, defaults, options || {});

    // prepare and check for errors in data
    try {
        lines = prepareData(lines);
    } catch (e) {
        this.response.status(500).send(e);
        return null;
    }

    let stats = calcRanges(lines);
    this._logger.info('data stats:', stats);
    const relativePadding = {
        x: stats.x.range * 0.05,
        y: stats.y.range * 0.05
    };
    let data = genGnuData(lines, options.labels, options.types, options.smooth === 'true');
    let opts = {title: options.title, xLabel: options.xLabel, yLabel: options.yLabel};
    opts.xRange = {min: stats.x.min - relativePadding.x, max: stats.x.max + relativePadding.x};
    opts.yRange = {min: stats.y.min - relativePadding.y, max: stats.y.max + relativePadding.y};
    if (options.xRange.length === 2) opts.xRange = {min: options.xRange[0], max: options.xRange[1]};
    if (options.yRange.length === 2) opts.yRange = {min: options.yRange[0], max: options.yRange[1]};
    if (options.isTimeSeries == 'true') {
        opts.timeSeries = {
            axis: 'x',
            inputFormat: options.timeInputFormat,
            outputFormat: options.timeDisplayFormat
        };
    }
    
    // if a specific number of ticks are requested
    if (options.xTicks) {
        let tickStep = (stats.x.max - stats.x.min)/options.xTicks;
        opts.xTicks = [stats.x.min, tickStep, stats.x.max];
    }
    
    this._logger.trace('charting with options', opts);

    try {
        var chartStream =  gnuPlot.draw(data, opts);
    } catch (e) {
        this.response.status(500).send('error in drawing the plot. bad input.');
        return null;
    }

    return rpcUtils.collectStream(chartStream).then( buffer => {
        rpcUtils.sendImageBuffer(this.response, buffer, this._logger);
    }).catch(this._logger.error);
};

chart.drawLineChart = function(dataset, xAxisTag, yAxisTag, datasetTag, title){
    let lines = [];

    // testMultipleDataset credit to Dung
    let isMultipleDataset = rawArray => {
        let numLayers = (rawArray) => {
            if (typeof rawArray !== 'object') {
                return 0;
            }
            return numLayers(rawArray[0]) + 1;
        };

        return numLayers(rawArray) === 4;
    };

    if (!isMultipleDataset(dataset)){
        this._logger.trace('oneline input detected');
        dataset = [dataset];
    }

    dataset.forEach(line => {
        line = line.map(pt => {
            let newPt = [];
            newPt.push(pt[0][1]);
            newPt.push(pt[1][1]);
            return newPt;
        });
        lines.push(line);
    });

    // account for list or string datasettag
    if (!Array.isArray(datasetTag)){
        datasetTag = [datasetTag];
    }

    let opts = {
        xLabel: xAxisTag,
        yLabel: yAxisTag,
        title: title,
        smooth: true,
        labels: datasetTag
    };

    return chart.draw.call(this, lines, _.toPairs(opts));
};

chart.drawBarChart = function(dataset, xAxisTag, yAxisTag, datasetTag, title){
    return chart.drawLineChart.apply(this, arguments);
};

chart.defaultOptions = function(){
    return rpcUtils.jsonToSnapList(defaults);
};

module.exports = chart;