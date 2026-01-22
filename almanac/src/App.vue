<template>
  <div class="app-container">
    <div class="content-wrapper">
      <h1>Astronomical Almanac</h1>

      <form @submit.prevent="generateAlmanac">
      <!-- Input Form -->
      <div class="form-card">
        <div class="form-row">
          <div class="form-field">
            <label for="year">Year</label>
            <input
              id="year"
              v-model.number="year"
              type="number"
              min="1800"
              max="2200"
              required
            />
          </div>

          <div class="form-field">
            <label for="latitude">Latitude</label>
            <div class="input-with-button">
              <input
                id="latitude"
                v-model.number="latitude"
                type="number"
                step="0.0001"
                min="-90"
                max="90"
                required
              />
              <button
                @click="getCurrentLocation"
                :disabled="loadingLocation"
                class="icon-btn"
                title="Get current location"
              >
                📍
              </button>
            </div>
          </div>

          <div class="form-field">
            <label for="longitude">Longitude</label>
            <input
              id="longitude"
              v-model.number="longitude"
              type="number"
              step="0.0001"
              min="-180"
              max="180"
              required
            />
          </div>

          <div class="form-field">
            <label for="timezone">Timezone (UTC offset)</label>
            <input
              id="timezone"
              v-model.number="timezone"
              type="number"
              step="0.5"
              min="-12"
              max="14"
              required
            />
          </div>

          <div class="form-field">
            <button
              type="submit"
              :disabled="loading"
              class="generate-btn"
            >
              {{ loading ? 'Loading...' : 'Generate Almanac' }}
            </button>
          </div>
        </div>

        <div v-if="locationError" class="error-msg">
          {{ locationError }}
        </div>
      </div>
      </form>

      <!-- Plot Area -->
      <div v-if="plotData" class="plot-card">
        <div ref="plotContainer" class="plot-container"></div>
      </div>

      <!-- Error Display -->
      <div v-if="error" class="error-banner">
        ⚠️ {{ error }}
      </div>

      <!-- Loading Indicator -->
      <div v-if="loading" class="loading-overlay">
        <div class="spinner"></div>
        <p>Fetching data for {{ year }}...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import axios from 'axios'
import Plotly from 'plotly.js-dist-min'

// Planet colors matching the Haskell Almanac
const planetColors = {
  mercury: 'rgb(125, 125, 125)',  // light grey
  venus: 'rgb(255, 220, 0)',      // yellow (slightly darker for visibility)
  mars: 'rgb(255, 0, 0)',          // red
  jupiter: 'rgb(255, 125, 0)',     // orange
  saturn: 'rgb(125, 0, 255)',      // violet
  uranus: 'rgb(0, 255, 255)',      // cyan
  neptune: 'rgb(0, 125, 255)',     // ocean blue
  pluto: 'rgb(100, 100, 100)'      // dark grey (slightly lighter for visibility)
}

// Inner planets show rise/set, outer planets show transit
const innerPlanets = ['mercury', 'venus']
const outerPlanets = ['mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']
const allPlanets = [...innerPlanets, ...outerPlanets]

// Form data
const year = ref(new Date().getFullYear())
const latitude = ref(58.378)
const longitude = ref(26.729)
const timezone = ref(0)

// State
const loading = ref(false)
const loadingLocation = ref(false)
const locationError = ref('')
const error = ref('')
const plotData = ref(null)
const planetData = ref({})
const plotContainer = ref(null)

// Get current location
const getCurrentLocation = () => {
  if (!navigator.geolocation) {
    locationError.value = 'Geolocation is not supported by your browser'
    return
  }

  loadingLocation.value = true
  locationError.value = ''

  // Set timezone offset from browser
  const offsetMinutes = -new Date().getTimezoneOffset()
  timezone.value = offsetMinutes / 60

  navigator.geolocation.getCurrentPosition(
    (position) => {
      latitude.value = parseFloat(position.coords.latitude.toFixed(4))
      longitude.value = parseFloat(position.coords.longitude.toFixed(4))
      loadingLocation.value = false
    },
    (err) => {
      locationError.value = `Unable to retrieve location: ${err.message}`
      loadingLocation.value = false
    }
  )
}

// Generate almanac
const generateAlmanac = async () => {
  error.value = ''
  loading.value = true

  try {
    // Calculate date range for the entire year
    const startDate = `${year.value}-01-01`
    const endDate = `${year.value}-12-31`

    // Call EphemAPI for sun data
    const sunResponse = await axios.get('http://localhost:3000/api/sunrise-sunset', {
      params: {
        lat: latitude.value,
        lon: longitude.value,
        startDate: startDate,
        endDate: endDate
      }
    })

    plotData.value = sunResponse.data

    // Fetch planet data for all planets in parallel
    const planetPromises = allPlanets.map(planet =>
      axios.get('http://localhost:3000/api/planet-rise-set-transit', {
        params: {
          lat: latitude.value,
          lon: longitude.value,
          planet: planet,
          startDate: startDate,
          endDate: endDate
        }
      }).then(res => ({ planet, data: res.data }))
       .catch(err => {
         console.warn(`Failed to fetch ${planet} data:`, err.message)
         return { planet, data: [] }
       })
    )

    const planetResults = await Promise.all(planetPromises)
    planetData.value = {}
    planetResults.forEach(({ planet, data }) => {
      planetData.value[planet] = data
    })

    // Wait for DOM update and create plot
    await nextTick()
    createPlot(sunResponse.data)

  } catch (err) {
    error.value = `Failed to fetch data: ${err.message}`
    console.error('Error fetching almanac data:', err)
  } finally {
    loading.value = false
  }
}

// Create planet traces for visualization
const createPlanetTraces = (sunData, offset) => {
  const traces = []
  const isLeapYear = (year.value % 4 === 0 && year.value % 100 !== 0) || (year.value % 400 === 0)

  const plotLeft = 0
  const plotRight = 24

  // Build night boundaries array using the same logic as the sun visualization
  // This handles polar night/day transitions correctly
  const nightBoundaries = [] // Array of {dayOfYear, left, right} where left <= x <= right is night

  let polarNight = true
  let polarDay = false
  let polarDayEnd = false

  sunData.forEach((d, i) => {
    const nextDayData = sunData[i + 1]
    if (!nextDayData) return

    const dayOfYear = i + 1

    // Calculate sunset and sunrise in plot coordinates (same as sun visualization)
    let sunset = d.error ? null : clip(timeToHours(d.sunset) + offset)
    let sunrise = nextDayData.error ? null : clip(timeToHours(nextDayData.sunrise) + offset)
    sunrise = !sunset ? null : sunrise
    sunset = !sunrise ? null : sunset
    if (sunset !== null && sunrise !== null && sunset > sunrise) {
      sunset = null
      sunrise = null
    }

    // Apply polar night/day state machine (same as sun visualization)
    let nightLeft = null
    let nightRight = null

    if (sunset === null || sunrise === null) {
      if (polarNight) {
        nightLeft = plotLeft
        nightRight = plotRight
      } else if (polarDayEnd) {
        polarNight = true
        polarDayEnd = false
        nightLeft = plotLeft
        nightRight = plotRight
      } else {
        polarDay = true
        // No night region during polar day
        nightLeft = null
        nightRight = null
      }
    } else {
      polarNight = false
      if (polarDay) {
        polarDay = false
        polarDayEnd = true
      }
      nightLeft = sunset
      nightRight = sunrise
    }

    nightBoundaries.push({
      dayOfYear,
      left: nightLeft,
      right: nightRight
    })
  })

  // Helper to check if a point is within the night region
  const isInNightRegion = (x, dayOfYear) => {
    const boundary = nightBoundaries.find(b => b.dayOfYear === dayOfYear)
    if (!boundary) return false
    if (boundary.left === null || boundary.right === null) return false
    // Night region is from left (sunset) to right (sunrise)
    return x >= boundary.left && x <= boundary.right
  }

  // Process inner planets (Mercury, Venus) - show rise and set times
  innerPlanets.forEach(planet => {
    const pData = planetData.value[planet] || []
    if (pData.length === 0) return

    const riseXValues = []
    const riseYValues = []
    const setXValues = []
    const setYValues = []
    const riseDates = []
    const setDates = []
    const riseTexts = []
    const setTexts = []
    const riseAzimuths = []
    const setAzimuths = []

    pData.forEach((d, i) => {
      if (d.error) return

      const dayOfYear = getDayOfYear(d.date, isLeapYear)
      const riseHours = timeToHours(d.rise)
      const setHours = timeToHours(d.set)

      // Transform to plot coordinates
      const riseX = clip(riseHours + offset)
      const setX = clip(setHours + offset)

      // Skip if set is later than rise (same check as sun)
      if (setX > riseX) return

      // Only show if within the night region (shaded area)
      if (isInNightRegion(riseX, dayOfYear)) {
        riseXValues.push(riseX)
        riseYValues.push(dayOfYear)
        riseDates.push(d.date)
        riseTexts.push(shiftTime(d.rise, getTimeZone()))
        riseAzimuths.push(d.riseAzimuth?.toFixed(1) ?? "")
      }
      if (isInNightRegion(setX, dayOfYear)) {
        setXValues.push(setX)
        setYValues.push(dayOfYear)
        setDates.push(d.date)
        setTexts.push(shiftTime(d.set, getTimeZone()))
        setAzimuths.push(d.setAzimuth?.toFixed(1) ?? "")
      }
    })

    // Split data at discontinuities (large jumps in x values)
    const riseSegments = splitDataAtDiscontinuities(riseXValues, riseYValues, riseDates, riseTexts, riseAzimuths)
    const setSegments = splitDataAtDiscontinuities(setXValues, setYValues, setDates, setTexts, setAzimuths)

    // Add rise traces
    riseSegments.forEach(seg => {
      if (seg.x.length > 1) {
        traces.push({
          x: seg.x,
          y: seg.y,
          mode: 'lines',
          name: `${capitalize(planet)} Rise`,
          line: { color: planetColors[planet], width: 2 },
          legendgroup: planet,
          showlegend: false,
          hovertemplate: `${capitalize(planet)} Rise<br>%{customdata}<br>%{text}<br>Azimuth: %{meta}°<extra></extra>`,
          customdata: seg.dates.map(d => formatDateStr(d)),
          text: seg.texts,
          meta: seg.azimuths
        })
      }
    })

    // Add set traces
    setSegments.forEach(seg => {
      if (seg.x.length > 1) {
        traces.push({
          x: seg.x,
          y: seg.y,
          mode: 'lines',
          name: `${capitalize(planet)} Set`,
          line: { color: planetColors[planet], width: 2 },
          legendgroup: planet,
          showlegend: false,
          hovertemplate: `${capitalize(planet)} Set<br>%{customdata}<br>%{text}<br>Azimuth: %{meta}°<extra></extra>`,
          customdata: seg.dates.map(d => formatDateStr(d)),
          text: seg.texts,
          meta: seg.azimuths
        })
      }
    })

    // Add a single legend entry for this planet
    traces.push({
      x: [null],
      y: [null],
      mode: 'lines',
      name: capitalize(planet),
      line: { color: planetColors[planet], width: 2 },
      legendgroup: planet,
      showlegend: true
    })
  })

  // Process outer planets (Mars, Jupiter, Saturn, Uranus, Neptune, Pluto) - show transit times
  outerPlanets.forEach(planet => {
    const pData = planetData.value[planet] || []
    if (pData.length === 0) return

    const transitXValues = []
    const transitYValues = []
    const transitDates = []
    const transitTexts = []
    const transitMetas = []

    pData.forEach((d, i) => {
      if (d.error || !d.transit) return

      const dayOfYear = getDayOfYear(d.date, isLeapYear)

      // Use transit time from API
      const transitHours = timeToHours(d.transit)

      // Transform to plot coordinates
      const transitX = clip(transitHours + offset)

      // Only show if within the night region (shaded area)
      if (isInNightRegion(transitX, dayOfYear)) {
        transitXValues.push(transitX)
        transitYValues.push(dayOfYear)
        transitDates.push(d.date)
        transitTexts.push(shiftTime(d.transit, getTimeZone()))
        // Store altitude from API for hover display
        const alt = d.transitAltitude?.toFixed(1) ?? ""
        transitMetas.push(`Altitude: ${alt}°`)
      }
    })

    // Split data at discontinuities
    const segments = splitDataAtDiscontinuities(transitXValues, transitYValues, transitDates, transitTexts, transitMetas)

    // Add transit traces as lines
    segments.forEach(seg => {
      if (seg.x.length > 1) {
        traces.push({
          x: seg.x,
          y: seg.y,
          mode: 'lines',
          name: `${capitalize(planet)} Transit`,
          line: { color: planetColors[planet], width: 2 },
          legendgroup: planet,
          showlegend: false,
          hovertemplate: `${capitalize(planet)} Transit<br>%{customdata}<br>%{text}<br>%{meta}<extra></extra>`,
          customdata: seg.dates.map(d => formatDateStr(d)),
          text: seg.texts,
          meta: seg.azimuths
        })
      }
    })

    // Add a single legend entry for this planet
    traces.push({
      x: [null],
      y: [null],
      mode: 'lines',
      name: `${capitalize(planet)}`,
      line: { color: planetColors[planet], width: 2 },
      legendgroup: planet,
      showlegend: true
    })
  })

  return traces
}

// Split data arrays at discontinuities (large jumps)
const splitDataAtDiscontinuities = (xValues, yValues, dates, texts, azimuths = null) => {
  const segments = []
  let currentSegment = { x: [], y: [], dates: [], texts: [], azimuths: [] }

  for (let i = 0; i < xValues.length; i++) {
    if (currentSegment.x.length === 0) {
      currentSegment.x.push(xValues[i])
      currentSegment.y.push(yValues[i])
      currentSegment.dates.push(dates[i])
      currentSegment.texts.push(texts[i])
      if (azimuths) currentSegment.azimuths.push(azimuths[i])
    } else {
      const lastX = currentSegment.x[currentSegment.x.length - 1]
      const lastY = currentSegment.y[currentSegment.y.length - 1]
      // Check for discontinuity (x jump > 12 hours or y jump > 1 day)
      if (Math.abs(xValues[i] - lastX) > 12 || Math.abs(yValues[i] - lastY) > 1) {
        if (currentSegment.x.length > 0) {
          segments.push(currentSegment)
        }
        currentSegment = { x: [], y: [], dates: [], texts: [], azimuths: [] }
      }
      currentSegment.x.push(xValues[i])
      currentSegment.y.push(yValues[i])
      currentSegment.dates.push(dates[i])
      currentSegment.texts.push(texts[i])
      if (azimuths) currentSegment.azimuths.push(azimuths[i])
    }
  }

  if (currentSegment.x.length > 0) {
    segments.push(currentSegment)
  }

  return segments
}

// Helper to get day of year from date string
const getDayOfYear = (dateStr, isLeapYear) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let dayOfYear = d
  for (let i = 0; i < m - 1; i++) {
    dayOfYear += daysInMonth[i]
  }
  return dayOfYear
}

// Helper to capitalize first letter
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1)

// Helper to format date string for display
const formatDateStr = (dateStr) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Helper to convert hours to time string
const hoursToTimeStr = (hours) => {
  const h = Math.floor(hours)
  const m = Math.floor((hours - h) * 60)
  const s = Math.floor(((hours - h) * 60 - m) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// Create the hourglass plot
const createPlot = (data) => {
  if (!plotContainer.value) return

  // For each day, use current day's sunset and next day's sunrise
  // This represents the night between days
  const sunsetXValues = []
  const sunriseXValues = []
  const yValues = []

  // Print full data for debugging
  /*console.log('=== Sunrise/Sunset Data ===')
  console.log('Day | Date | Sunset UTC | Sunrise (next day) UTC | Sunset Local | Sunrise Local')
  data.slice(150, 170).forEach((d, idx) => {
    if (d.error) return
    const i = idx + 150
    const nextDay = data[i + 1]
    if (nextDay) {
      const sunsetUTC = timeToHours(d.sunset)
      const sunriseUTC = timeToHours(nextDay.sunrise)
      const sunsetLocal = ((sunsetUTC + timezone.value) % 24 + 24) % 24
      const sunriseLocal = ((sunriseUTC + timezone.value) % 24 + 24) % 24
      console.log(`${i+1} | ${d.date} | ${d.sunset} (${sunsetUTC.toFixed(2)}) | ${nextDay.sunrise} (${sunriseUTC.toFixed(2)}) | ${sunsetLocal.toFixed(2)} | ${sunriseLocal.toFixed(2)}`)
    }
  })*/

  const offset = Math.round(12 + longitude.value * 24/360)

  data.forEach((d, i) => {
    const nextDayData = data[i + 1]
    if (!nextDayData) return

    // Always pair day i's sunset with day i+1's sunrise
    let sunset = d.error ? null : clip(timeToHours(d.sunset) + offset)
    let sunrise = nextDayData.error ? null : clip(timeToHours(nextDayData.sunrise) + offset)
    sunrise = !sunset ? null : sunrise
    sunset = !sunrise ? null : sunset
    if (sunset > sunrise) {
        sunset = null
        sunrise = null
    }
    sunsetXValues.push(sunset)
    sunriseXValues.push(sunrise)
    yValues.push(i + 1)
  })

  const plotLeft = 0
  const plotRight = 24

  // Create traces for sunrise and sunset curves
  const sunsetTrace = {
    x: sunsetXValues,
    y: yValues,
    mode: 'lines',
    name: 'Sun',
    line: {
      color: 'rgb(200, 200, 255)',
      width: 2
    },
    legendgroup: 'sun',
    showlegend: false,
    hovertemplate: 'Sunset<br>%{customdata}<br>%{text}<br>Azimuth: %{meta}°<extra></extra>',
    customdata: yValues.map(day => formatDay(day)),
    text: data.slice(0, -1).map(d => d.error ? "" : shiftTime(d.sunset, getTimeZone())),
    meta: data.slice(0, -1).map(d => d.error ? "" : d.sunsetAzimuth?.toFixed(1) ?? "")
  }

  const sunriseTrace = {
    x: sunriseXValues,
    y: yValues,
    mode: 'lines',
    name: 'Sun',
    line: {
      color: 'rgb(200, 200, 255)',
      width: 2
    },
    legendgroup: 'sun',
    showlegend: false,
    hovertemplate: 'Sunrise<br>%{customdata}<br>%{text}<br>Azimuth: %{meta}°<extra></extra>',
    customdata: yValues.map(day => formatDay(day)),
    text: data.slice(1).map(d => d.error ? "" : shiftTime(d.sunrise, getTimeZone())),
    meta: data.slice(1).map(d => d.error ? "" : d.sunriseAzimuth?.toFixed(1) ?? "")
  }

  let polarNight = true
  let polarDay = false
  let polarDayEnd = false
  // Create night duration bars (horizontal lines between curves)
  const nightBars = []
  sunsetXValues.forEach((sunsetX, i) => {
    let sunriseX = sunriseXValues[i]
    if (!sunsetX || !sunriseX) {
        if (polarNight) {
            sunsetX = plotLeft
            sunriseX = plotRight
        } else if (polarDayEnd) {
            polarNight = true
            polarDayEnd = false
            sunsetX = plotLeft
            sunriseX = plotRight
        } else {
            polarDay = true
        }
    } else {
        polarNight = false
        if (polarDay) {
            polarDay = false
            polarDayEnd = true
        }
    }
    nightBars.push({
      x: [sunsetX, sunriseX],
      y: [yValues[i], yValues[i]],
      mode: 'lines',
      line: {
        color: 'rgba(200, 200, 255, 0.3)',
        width: 1
      },
      showlegend: false,
      hoverinfo: 'skip'
    })
  })

  // Create planet traces
  const planetTraces = createPlanetTraces(data, offset)

  const traces = [sunsetTrace, sunriseTrace, ...nightBars, ...planetTraces]

  // Create month labels and dividers
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const shapes = []
  const annotations = []

  // Y-axis custom tick labels
  const yTickVals = []
  const yTickText = []

  let dayCounter = 1  // Start from 1 to match y-values in data
  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(year.value, month + 1, 0).getDate()
    const monthStart = dayCounter
    const monthMiddle = dayCounter + daysInMonth / 2

    // Add month label on y-axis
    yTickVals.push(monthStart)
    yTickText.push(monthNames[month] + " " + 1)

    // Add day 10 and 20 markers within each month
    if (daysInMonth >= 10) {
      yTickVals.push(monthStart + 9)  // Day 10 is at index +9 from monthStart
      yTickText.push('10')
    }
    if (daysInMonth >= 20) {
      yTickVals.push(monthStart + 19)  // Day 20 is at index +19 from monthStart
      yTickText.push('20')
    }

    dayCounter += daysInMonth
  }

  // Layout configuration
  const layout = {
    title: `Sun & Planets for ${year.value} (Lat: ${latitude.value.toFixed(4)}°, Lon: ${longitude.value.toFixed(4)}°)`,
    xaxis: {
      title: 'Hours',
      range: [plotLeft, plotRight],
      tickmode: 'array',
      tickvals: range(plotLeft, plotRight),
      ticktext: range(plotLeft, plotRight).map(n => clip(n - offset + getTimeZone()).toString().padStart(2, '0'))
    },
    yaxis: {
      title: 'Month',
      range: [dayCounter, 1],
      tickmode: 'array',
      tickvals: yTickVals,
      ticktext: yTickText,
      showticklabels: true,
    },
    shapes: shapes,
    annotations: annotations,
    hovermode: 'closest',
    showlegend: true,
    legend: {
      orientation: 'h',
      yanchor: 'bottom',
      y: 1.02,
      xanchor: 'center',
      x: 0.5
    },
    height: 850,
    margin: {
      l: 100,
      r: 50,
      t: 80,
      b: 80
    }
  }

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false
  }

  Plotly.newPlot(plotContainer.value, traces, layout, config)
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const clip = (n) => {
    return (n % 24 + 24) % 24
}

function shiftTime(timeStr, hours) {
    const [h, m, s] = timeStr.split(':').map(Number);
    const totalSeconds = (h * 3600 + m * 60 + s) + hours * 3600;
    const normalized = ((totalSeconds % 86400) + 86400) % 86400; // Keep in 0–86399
    const hh = Math.floor(normalized / 3600);
    const mm = Math.floor((normalized % 3600) / 60);
    const ss = Math.floor(normalized % 60);
    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

const getTimeZone = () => {
    return parseFloat(timezone.value) || 0
}

const formatDay = (day) => {
    const date = new Date(year.value, 0, day);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Helper function to convert time string to hours
const timeToHours = (timeStr) => {
  const [hours, minutes, seconds] = timeStr.split(':').map(Number)
  return hours + minutes / 60 + seconds / 3600
}

// Get current location on mount
onMounted(() => {
  getCurrentLocation()
})
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: #f5f5f5;
}

.app-container {
  min-height: 100vh;
  padding: 20px;
}

.content-wrapper {
  max-width: 1400px;
  margin: 0 auto;
}

h1 {
  font-size: 2rem;
  font-weight: 600;
  margin-bottom: 24px;
  color: #1976d2;
}

.form-card {
  background: white;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
}

label {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #333;
}

input {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;
}

input:focus {
  outline: none;
  border-color: #1976d2;
}

.input-with-button {
  display: flex;
  gap: 8px;
}

.input-with-button input {
  flex: 1;
}

.icon-btn {
  padding: 10px 16px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.2s;
}

.icon-btn:hover:not(:disabled) {
  background: #e0e0e0;
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.generate-btn {
  width: 100%;
  padding: 10px 24px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 24px;
}

.generate-btn:hover:not(:disabled) {
  background: #1565c0;
}

.generate-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.plot-card {
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.plot-container {
  width: 100%;
  height: 850px;
}

.error-msg {
  margin-top: 16px;
  padding: 12px;
  background: #ffebee;
  color: #c62828;
  border-radius: 4px;
  font-size: 14px;
}

.error-banner {
  background: #f44336;
  color: white;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  color: white;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-overlay p {
  font-size: 18px;
  font-weight: 500;
}

@media (max-width: 768px) {
  h1 {
    font-size: 1.5rem;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .plot-container {
    height: 600px;
  }
}
</style>
