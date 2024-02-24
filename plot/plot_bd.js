/**
 * All floating point arithmetic with BigDecimals
 */

function PlotArea(left, bottom, right, top) {
	this.left = left;
	this.bottom = bottom;
	this.right = right;
	this.top = top;
	this.width = right.subtract(left);
	this.height = top.subtract(bottom);
}

Plot.prototype.toScreenCoords = function(dataPoint) {
	return new DataPoint(
		toDouble((dataPoint.x.subtract(this.plotArea.left)).multiply(plotToScreenXCoef)), 
		toDouble(this.canvasHeight.subtract(dataPoint.y.subtract(this.plotArea.bottom).multiply(plotToScreenYCoef)))
		);
}
	
Plot.prototype.toPlotCoords = function(dataPoint) {
	return new DataPoint(
		this.plotArea.left.add(toBigDecimal(dataPoint.x).multiply(this.screenToPlotXCoef)), 
		this.plotArea.bottom.add(this.canvasHeight.subtract(toBigDecimal(dataPoint.y)).multiply(this.screenToPlotYCoef))
		);
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
		var deltaX = toBigDecimal(newX - this.lastMouseX);
		var deltaY = toBigDecimal(newY - this.lastMouseY);
		
		var changeX = deltaX.multiply(this.plotArea.width).divide(toBigDecimal(this.canvas.width), this.plotArea.width.scale(), BigDecimal.prototype.ROUND_HALF_UP);
		var changeY = deltaY.multiply(this.plotArea.height).divide(toBigDecimal(this.canvas.height), this.plotArea.height.scale(), BigDecimal.prototype.ROUND_HALF_UP);
		this.plotArea = new PlotArea(this.plotArea.left.subtract(changeX), this.plotArea.bottom.add(changeY),
			this.plotArea.right.subtract(changeX), this.plotArea.top.add(changeY));
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
	
	var xDelta = (2 * this.lastMouseX - this.canvas.width) / this.canvas.width;
	var yDelta = (2 * this.lastMouseY - this.canvas.height) / this.canvas.height;
	var xLeftCoef = delta * (xDelta + 1);
	var xRightCoef = delta * (1 - xDelta);
	var yTopCoef = delta * (yDelta + 1);
	var yBottomCoef = delta * (1 - yDelta);
	
	var newLeft = plotArea.left.add(this.plotArea.width.multiply(toBigDecimal(xLeftCoef)));
	var newBottom = this.plotArea.bottom.add(this.plotArea.height.multiply(toBigDecimal(yBottomCoef)));
	var newRight = this.plotArea.right.subtract(this.plotArea.width.multiply(toBigDecimal(xRightCoef)));
	var newTop = this.plotArea.top.subtract(this.plotArea.height.multiply(toBigDecimal(yTopCoef)));
	
	var newLeftRight = this.rescale(newLeft, newRight);
	var newBottomTop = this.rescale(newBottom, newTop);
	this.plotArea = new PlotArea(
		newLeftRight[0], 
		newBottomTop[0],
		newLeftRight[1], 
		newBottomTop[1]
		);
	
	this.plotAreaChanged();
	this.changed = true;
}
	
Plot.prototype.rescale = function(new1, new2) {
	var newDiff = new2.subtract(new1);
	if (newDiff.compareTo(new BigDecimal("10000")) > 0) {
		new1 = new1.setScale(0, BigDecimal.prototype.ROUND_HALF_UP);
		new2 = new2.setScale(0, BigDecimal.prototype.ROUND_HALF_UP);
	} else {
		var scale = new BigDecimal("1000");
		var i = 0;
		while (newDiff.compareTo(scale) < 0) {
			scale = scale.divide(new BigDecimal("10"), i++, BigDecimal.prototype.ROUND_HALF_UP);
		}
		new1 = new1.setScale(i, BigDecimal.prototype.ROUND_HALF_UP);
		new2 = new2.setScale(i, BigDecimal.prototype.ROUND_HALF_UP);
	}
	return [new1, new2];
}

Plot.prototype.plotAreaChanged = function() {
	if (this.canvasWidth == null) {
		this.canvasWidth = toBigDecimal(canvas.width);
	}
	if (this.canvasHeight == null) {
		this.canvasHeight = toBigDecimal(canvas.height);
	}
	this.screenToPlotXCoef = this.plotArea.width.divide(this.canvasWidth, this.plotArea.width.scale() + 4, BigDecimal.prototype.ROUND_HALF_UP);
	this.screenToPlotYCoef = this.plotArea.height.divide(this.canvasHeight, this.plotArea.height.scale() + 4, BigDecimal.prototype.ROUND_HALF_UP);

	this.plotToScreenXCoef = BigDecimal.prototype.ONE.divide(this.screenToPlotXCoef, 4, BigDecimal.prototype.ROUND_HALF_UP);
	this.plotToScreenYCoef = BigDecimal.prototype.ONE.divide(this.screenToPlotYCoef, 4, BigDecimal.prototype.ROUND_HALF_UP);
}
