var PlotType = {
	"Lines" : 1,
	"Points" : 2,
	"Rectangles" : 3,
	"Text": 4
	}
Object.freeze(PlotType);

function LineStyle(color, width, cap /*butt, round, square*/, join /*bevel, round, meter*/) {
	this.color = color;
	this.width = width;
	this.cap = cap;
	this.join = join;
}

function DataPoint(x, y) {
	this.x = x;
	this.y = y;
}

function PlotData(plotType, plotOrScreenCoords) {
	this.type = plotType;
	this.dataPoints = new Array();
	this.dataStyles = new Array();
	this.plotOrScreenCoords = plotOrScreenCoords;
	
	this.addDataPoint = function(dataPoint, dataStyle) {
		this.dataPoints.push(dataPoint);
		this.dataStyles.push(dataStyle);
	}
	
	this.getType = function() {
		return this.type;
	}
	
	this.getDataPoints = function() {
		return this.dataPoints;
	}

	this.getDataStyles = function() {
		return this.dataStyles;
	}
	
	this.setLineStyle = function(lineStyle) {
		this.lineStyle = lineStyle;
	}
	
	this.getLineStyle = function() {
		return this.lineStyle;
	}
	
	this.isPlotOrScreenCoords = function() {
		return this.plotOrScreenCoords;
	}
	
	if (this.type == PlotType.Rectangles) {
		this.setWidth = function(width) {
			this.width = width;
		}
		
		this.getWidth = function() {
			return this.width;
		}

		this.setHeight = function(height) {
			this.height = height;
		}

		this.getHeight = function() {
			return this.height;
		}
	}
	
	if (this.type == PlotType.Text) {
		this.text = "";
		this.font = "30px Arial";
		this.align = "center";
		
		this.setText = function(text) {
			this.text = text;
		}

		this.getText = function() {
			return this.text;
		}

		this.setFont = function(font) {
			this.font = font;
		}

		this.getFont = function() {
			return this.font;
		}

		this.setAlign = function(align) {
			this.align = align;
		}

		this.getAlign = function() {
			return this.align;
		}

	}

}

function Plot(canvas, plotArea) {
	this.canvas = canvas;
	this.plotArea = plotArea;
	this.background = 'black'
	this.dataSets = new Array();
	this.changed = true;
	this.redraw = false;
    this.mouseDown = false;
    this.lastMouseX = null;
    this.lastMouseY = null;
	this.lastMouseDownX2 = null;
	this.lastMouseDownY2 = null;
	this.lastMouseDownX = null;
	this.lastMouseDownY = null;
	this.lastMouseDownButton = null;
	this.lastMouseUpX = null;
	this.lastMouseUpY = null;
	this.lastMouseUpX2 = null;
	this.lastMouseUpY2 = null;
	this.lastKeyCode = null;
	this.plotAreaChanged();
}

Plot.prototype.setBackground = function(color) {
	this.background = color;
}

Plot.prototype.addData = function(plotData) {
	this.dataSets.push(plotData);
}

Plot.prototype.clearData = function() {
	this.dataSets = new Array();
}
	
Plot.prototype.plot = function() {
	if (this.changed || this.redraw) {
		if (this.context == null) {
			this.context = this.canvas.getContext("2d");
		}
		//this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.context.fillStyle = this.background;
		this.context.strokeStyle = this.background;
		this.context.rect(0, 0, this.canvas.width, this.canvas.height);
		this.context.fill();
		this.context.stroke();
		if (this.plotArea != null && this.dataSets != null) {
			for (i in this.dataSets) {
				var plotData = this.dataSets[i];
				if (plotData != null) {
					this.context.beginPath();
					if (plotData.getType() == PlotType.Lines) {
						this.plotLines(plotData);
					} else if (plotData.getType() == PlotType.Points) {
						this.plotPoints(plotData);
					} else if (plotData.getType() == PlotType.Rectangles) {
						this.plotRectangles(plotData);
					} else if (plotData.getType() == PlotType.Text) {
						this.plotText(plotData);
					}
					this.context.stroke();
				}
			}
		}
		this.changed = false;
		this.redraw = false;
	}
}
	
Plot.prototype.plotLines = function(plotData) {
	var dataPoints = plotData.getDataPoints();
	for (i in dataPoints) {
		var dataPoint = dataPoints[i];
		var screenPoint = plotData.isPlotOrScreenCoords() ? this.toScreenCoords(dataPoint) : dataPoint;
		if (i == 0) {
			this.context.moveTo(screenPoint.x, screenPoint.y);
		} else {
			this.context.lineTo(screenPoint.x, screenPoint.y);
		}
	}
	var lineStyle = plotData.getLineStyle();
	if (lineStyle != null) {
		if (lineStyle.color != null) {
			this.context.strokeStyle = lineStyle.color;
		}
		if (lineStyle.width != null) {
			this.context.lineWidth = lineStyle.width;
		}
		if (lineStyle.cap != null) {
			this.context.lineCap = lineStyle.cap;
		}
		if (lineStyle.join != null) {
			this.context.lineJoin = lineStyle.join;
		}
	}
}

Plot.prototype.plotPoints = function(plotData) {
	var dataPoints = plotData.getDataPoints();
	var dataStyles = plotData.getDataStyles();
	for (i in dataPoints) {
		var dataPoint = dataPoints[i];
		var screenPoint = plotData.isPlotOrScreenCoords() ? this.toScreenCoords(dataPoint) : dataPoint;
		this.context.fillStyle = dataStyles != null ? dataStyles[i] : "white";
		this.context.fillRect(screenPoint.x, screenPoint.y, 1, 1);
	}
}

Plot.prototype.plotRectangles = function(plotData) {
	var dataPoints = plotData.getDataPoints();
	var dataStyles = plotData.getDataStyles();
	
	var width = plotData.getWidth();
	var height = plotData.getHeight()
	if (plotData.isPlotOrScreenCoords()) {
		var xCoef = this.canvas.width / this.plotArea.width;
		var yCoef = this.canvas.height / this.plotArea.height;
		width *= xCoef;
		height *= yCoef;
	}
	
	for (i in dataPoints) {
		var dataPoint = dataPoints[i];
		var screenPoint = plotData.isPlotOrScreenCoords() ? this.toScreenCoords(dataPoint) : dataPoint;
		var lineStyle = plotData.getLineStyle();
		if (lineStyle != null) {
			if (lineStyle.color != null) {
				this.context.strokeStyle = lineStyle.color;
			}
			if (lineStyle.width != null) {
				this.context.lineWidth = lineStyle.width;
			}
			if (lineStyle.cap != null) {
				this.context.lineCap = lineStyle.cap;
			}
			if (lineStyle.join != null) {
				this.context.lineJoin = lineStyle.join;
			}
		}
		this.context.rect(screenPoint.x - width / 2, screenPoint.y - height / 2, width, height);
		if (dataStyles[i] != undefined) {
			this.context.fillStyle = dataStyles[i];
			this.context.fill();
		}
	}
}

Plot.prototype.plotText = function(plotData) {
	var dataPoints = plotData.getDataPoints();
	var dataStyles = plotData.getDataStyles();
	var dataText = plotData.getText();
	var align = plotData.getAlign();
	var font = plotData.getFont();
	for (i in dataPoints) {
		var dataPoint = dataPoints[i];
		var screenPoint = plotData.isPlotOrScreenCoords() ? this.toScreenCoords(dataPoint) : dataPoint;
		this.context.fillStyle = dataStyles[i] != undefined ? dataStyles[i] : "black";
		this.context.textAlign = align;
		this.context.font = font;
		this.context.fillText(dataText, screenPoint.x, screenPoint.y);
	}
}
	
Plot.prototype.isChanged = function() {
	return this.changed;
}
	
Plot.prototype.setChanged = function(changed) {
	this.changed = changed;
}

Plot.prototype.setRedraw = function() {
	this.redraw = true;
}

Plot.prototype.isRedraw = function() {
	return this.redraw;
}
	
Plot.prototype.getPlotArea = function() {
	return this.plotArea;
}

Plot.prototype.plotAreaChanged = function() {
}