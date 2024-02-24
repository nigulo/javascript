
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
	this.lastMouseDownX2 = this.lastMouseDownX;
	this.lastMouseDownY2 = this.lastMouseDownY;
	this.lastMouseDownX = event.offsetX;
	this.lastMouseDownY = event.offsetY;
	this.lastMouseDownButton = event.button;
	this.changed = true;
}

Plot.prototype.handleMouseUp = function(event) {
	this.lastMouseUpX2 = this.lastMouseUpX;
	this.lastMouseUpY2 = this.lastMouseUpY;
	this.lastMouseUpX = event.offsetX;
	this.lastMouseUpY = event.offsetY;
	this.mouseDown = false;
	this.changed = true;
}

Plot.prototype.handleMouseMove = function(event) {
    this.lastMouseX = null;
    this.lastMouseY = null;
	const boundingRect = this.canvas.getBoundingClientRect();
	if (event.clientX < boundingRect.left || event.clientX > boundingRect.right) {
		return;
	}
	if (event.clientY < boundingRect.top || event.clientY > boundingRect.bottom) {
		return;
	}
	var newX = event.offsetX;
	var newY = event.offsetY;
	
	this.lastMouseX = newX
	this.lastMouseY = newY;
	this.changed = true;	
}
	
Plot.prototype.handleMouseWheel = function(event) {
	this.changed = true;
}

Plot.prototype.handleKeyDown = function (event) {
	this.lastKeyCode = event.keyCode;
	this.changed = true;
}

Plot.prototype.handleKeyPress = function (event) {
	this.lastKeyCode = event.keyCode;
	this.changed = true;
}
