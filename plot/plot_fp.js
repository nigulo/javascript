
function PlotArea(left, bottom, right, top) {
	this.left = left;
	this.bottom = bottom;
	this.right = right;
	this.top = top;
	this.width = right - left;
	this.height = top - bottom;
}

Plot.prototype.toScreenCoords = function(dataPoint) {
	var xCoef = this.canvas.width / this.plotArea.width;
	var yCoef = this.canvas.height / this.plotArea.height;
	return new DataPoint((dataPoint.x - this.plotArea.left) * xCoef, this.canvas.height - (dataPoint.y - this.plotArea.bottom) * yCoef);
}
	
Plot.prototype.toPlotCoords = function(dataPoint) {
	var xCoef = this.plotArea.width / this.canvas.width;
	var yCoef = this.plotArea.height / this.canvas.height;
	return new DataPoint(this.plotArea.left + dataPoint.x * xCoef, this.plotArea.bottom + (this.canvas.height - dataPoint.y) * yCoef);
}
	
Plot.prototype.handleMouseDown = function(event) {
	this.mouseDown = true;
	this.lastMouseX = event.clientX;
	this.lastMouseY = event.clientY;
}

Plot.prototype.handleMouseUp = function(event) {
	this.mouseDown = false;
}

Plot.prototype.handleMouseMove = function(event) {
	var newX = event.clientX;
	var newY = event.clientY;
	if (this.mouseDown) {
		var deltaX = newX - this.lastMouseX
		var deltaY = newY - this.lastMouseY;
		
		var changeX = deltaX * this.plotArea.width / this.canvas.width;
		var changeY = deltaY * this.plotArea.height / this.canvas.height;
		this.plotArea = new PlotArea(this.plotArea.left - changeX, this.plotArea.bottom + changeY,
			this.plotArea.right - changeX, this.plotArea.top + changeY);
		this.changed = true;
	}
	
	this.lastMouseX = newX
	this.lastMouseY = newY;
	
	
}
	
Plot.prototype.handleMouseWheel = function(event) {
	if (this.lastMouseX == null || this.lastMouseY == null) {
		return;
	}
	var delta = event.wheelDelta / 120 / 10;
	
	var xDelta = (this.lastMouseX - this.canvas.width / 2) / this.canvas.width;
	var yDelta = (this.lastMouseY - this.canvas.height / 2) / this.canvas.height;
	if (delta < 0) {
		xDelta = -xDelta;
		yDelta = -yDelta;
	}
	
	this.plotArea = new PlotArea(this.plotArea.left + this.plotArea.width * (delta + xDelta), this.plotArea.bottom + this.plotArea.height * (delta - yDelta),
		this.plotArea.right - this.plotArea.width * (delta - xDelta), this.plotArea.top - this.plotArea.height * (delta + yDelta));
		
	this.changed = true;
}
