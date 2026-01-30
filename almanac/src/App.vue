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

// Store altitude data for inner planets at sunrise/sunset
const innerPlanetAltitudes = ref({})

// Store equinox data for polar regions
const equinoxData = ref(null)

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
const moonData = ref([])
const plotContainer = ref(null)

// Moon phase nominal elongation values (degrees)
const moonPhaseNominalElongation = {
  'New Moon': 0,
  'Waxing Crescent': 45,
  'First Quarter': 90,
  'Waxing Gibbous': 135,
  'Full Moon': 180,
  'Waning Gibbous': 225,
  'Last Quarter': 270,
  'Waning Crescent': 315
}

// Moon horizontal position (fraction between sunset and sunrise)
const moonPhasePosition = {
  'New Moon': 0.5,        // Not drawn, but define for completeness
  'Waxing Crescent': 0.05,
  'First Quarter': 0.2,
  'Waxing Gibbous': 0.35,
  'Full Moon': 0.5,
  'Waning Gibbous': 0.65,
  'Last Quarter': 0.8,
  'Waning Crescent': 0.95
}

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

    // Fetch moon phase data
    try {
      const moonResponse = await axios.get('http://localhost:3000/api/moon-phase', {
        params: {
          lat: latitude.value,
          lon: longitude.value,
          startDate: startDate,
          endDate: endDate
        }
      })
      moonData.value = moonResponse.data
    } catch (err) {
      console.warn('Failed to fetch moon data:', err.message)
      moonData.value = []
    }

    // Fetch altitude data for inner planets (Mercury, Venus) at sunrise/sunset times
    innerPlanetAltitudes.value = {}
    for (const planet of innerPlanets) {
      const pData = planetData.value[planet] || []
      const altitudes = {}

      // Build batch requests for altitude at sunrise and sunset
      const altitudePromises = []

      for (const dayData of pData) {
        if (dayData.error) continue

        // Find matching sun data for this date
        const sunDay = sunResponse.data.find(s => s.date === dayData.date)
        if (!sunDay || sunDay.error) continue

        // For evening star (set after sunset): get altitude at sunset
        if (dayData.set && sunDay.sunset) {
          const datetime = `${dayData.date} ${sunDay.sunset.substring(0, 5)}`
          altitudePromises.push(
            axios.get('http://localhost:3000/api/celestial-position', {
              params: {
                lat: latitude.value,
                lon: longitude.value,
                planet: planet,
                datetime: datetime
              }
            }).then(res => ({
              date: dayData.date,
              type: 'sunset',
              altitude: res.data.altitude
            })).catch(() => null)
          )
        }

        // For morning star (rise before sunrise): get altitude at sunrise
        if (dayData.rise && sunDay.sunrise) {
          const datetime = `${dayData.date} ${sunDay.sunrise.substring(0, 5)}`
          altitudePromises.push(
            axios.get('http://localhost:3000/api/celestial-position', {
              params: {
                lat: latitude.value,
                lon: longitude.value,
                planet: planet,
                datetime: datetime
              }
            }).then(res => ({
              date: dayData.date,
              type: 'sunrise',
              altitude: res.data.altitude
            })).catch(() => null)
          )
        }
      }

      // Execute all altitude requests in parallel (batch)
      const altitudeResults = await Promise.all(altitudePromises)
      altitudeResults.forEach(result => {
        if (result) {
          if (!altitudes[result.date]) altitudes[result.date] = {}
          altitudes[result.date][result.type] = result.altitude
        }
      })

      innerPlanetAltitudes.value[planet] = altitudes
    }

    // Fetch equinox data if near polar regions (abs(lat) > 89.4)
    if (Math.abs(latitude.value) > 89.4) {
      try {
        const equinoxResponse = await axios.get('http://localhost:3000/api/equinoxes', {
          params: { year: year.value }
        })
        equinoxData.value = equinoxResponse.data
      } catch (err) {
        console.warn('Failed to fetch equinox data:', err.message)
        equinoxData.value = null
      }
    } else {
      equinoxData.value = null
    }

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

  // Check if we should use equinox-based polar logic
  const usePolarEquinoxLogic = Math.abs(latitude.value) > 89.4 && equinoxData.value

  if (usePolarEquinoxLogic) {
    // Use equinox data for polar regions
    const springDay = equinoxData.value.springEquinox?.dayOfYear || 80
    const autumnDay = equinoxData.value.autumnEquinox?.dayOfYear || 266
    const isNorthPole = latitude.value > 0

    sunData.forEach((d, i) => {
      const nextDayData = sunData[i + 1]
      if (!nextDayData) return

      const dayOfYear = i + 1
      let nightLeft = null
      let nightRight = null

      // For North Pole: polar night before spring equinox and after autumn equinox
      // For South Pole: polar night between spring and autumn equinox
      const isPolarNight = isNorthPole
        ? (dayOfYear < springDay || dayOfYear >= autumnDay)
        : (dayOfYear >= springDay && dayOfYear < autumnDay)

      if (isPolarNight) {
        nightLeft = plotLeft
        nightRight = plotRight
      }
      // else: polar day, no night region (nightLeft/nightRight stay null)

      nightBoundaries.push({
        dayOfYear,
        left: nightLeft,
        right: nightRight
      })
    })
  } else {
    // Use standard state machine for non-polar regions
    // Initialize based on hemisphere: northern starts in polar night (Jan=winter),
    // southern starts in polar day (Jan=summer)
    const isNorthernHemisphere = latitude.value >= 0
    let polarNight = isNorthernHemisphere
    let polarDay = !isNorthernHemisphere
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
  }

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

    // Get altitude data for this planet
    const altitudes = innerPlanetAltitudes.value[planet] || {}

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
    const riseAltitudes = []  // Altitude at sunrise (morning star)
    const setAltitudes = []   // Altitude at sunset (evening star)

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

      // Get altitude data for this date
      const dayAltitudes = altitudes[d.date] || {}

      // Only show if within the night region (shaded area)
      // Rise in night = morning star, show altitude at sunrise
      if (isInNightRegion(riseX, dayOfYear)) {
        riseXValues.push(riseX)
        riseYValues.push(dayOfYear)
        riseDates.push(d.date)
        riseTexts.push(shiftTime(d.rise, getTimeZone()))
        riseAzimuths.push(d.riseAzimuth != null ? `${d.riseAzimuth.toFixed(1)}°` : "N/A")
        riseAltitudes.push(dayAltitudes.sunrise != null ? `${dayAltitudes.sunrise.toFixed(1)}°` : "N/A")
      }
      // Set in night = evening star, show altitude at sunset
      if (isInNightRegion(setX, dayOfYear)) {
        setXValues.push(setX)
        setYValues.push(dayOfYear)
        setDates.push(d.date)
        setTexts.push(shiftTime(d.set, getTimeZone()))
        setAzimuths.push(d.setAzimuth != null ? `${d.setAzimuth.toFixed(1)}°` : "N/A")
        setAltitudes.push(dayAltitudes.sunset != null ? `${dayAltitudes.sunset.toFixed(1)}°` : "N/A")
      }
    })

    // Split data at discontinuities (large jumps in x values)
    const riseSegments = splitDataAtDiscontinuities(riseXValues, riseYValues, riseDates, riseTexts, riseAzimuths, riseAltitudes)
    const setSegments = splitDataAtDiscontinuities(setXValues, setYValues, setDates, setTexts, setAzimuths, setAltitudes)

    // Add rise traces (morning star - show altitude at sunrise)
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
          hovertemplate: `${capitalize(planet)} rises<br>%{customdata} at %{text}<br>Azimuth: %{meta}<br>Altitude at sunrise: %{hovertext}<extra></extra>`,
          customdata: seg.dates.map(d => formatDateStr(d)),
          text: seg.texts,
          meta: seg.azimuths,
          hovertext: seg.altitudes || []
        })
      }
    })

    // Add set traces (evening star - show altitude at sunset)
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
          hovertemplate: `${capitalize(planet)} sets<br>%{customdata} at %{text}<br>Azimuth: %{meta}<br>Altitude at sunset: %{hovertext}<extra></extra>`,
          customdata: seg.dates.map(d => formatDateStr(d)),
          text: seg.texts,
          meta: seg.azimuths,
          hovertext: seg.altitudes || []
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
        // Store altitude and rise/set times for hover display
        const alt = d.transitAltitude != null ? `${d.transitAltitude.toFixed(1)}°` : "N/A"
        const rise = d.rise ? shiftTime(d.rise, getTimeZone()) : "N/A"
        const set = d.set ? shiftTime(d.set, getTimeZone()) : "N/A"
        transitMetas.push(`Altitude: ${alt}<br>Rise: ${rise}<br>Set: ${set}`)
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
          name: `${capitalize(planet)} transit`,
          line: { color: planetColors[planet], width: 2 },
          legendgroup: planet,
          showlegend: false,
          hovertemplate: `${capitalize(planet)} transits<br>%{customdata} at %{text}<br>%{meta}<extra></extra>`,
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

// Create moon traces for visualization
const createMoonTracesAndImages = (sunData, offset) => {
  const traces = []
  const images = []
  const isLeapYear = (year.value % 4 === 0 && year.value % 100 !== 0) || (year.value % 400 === 0)

  if (!moonData.value || moonData.value.length === 0) {
    return [traces, images]
  }

  // Build night boundaries for positioning (same as planet traces)
  const nightBoundaries = []

  // Check if we should use equinox-based polar logic
  const usePolarEquinoxLogic = Math.abs(latitude.value) > 89.4 && equinoxData.value

  if (usePolarEquinoxLogic) {
    // Use equinox data for polar regions
    const springDay = equinoxData.value.springEquinox?.dayOfYear || 80
    const autumnDay = equinoxData.value.autumnEquinox?.dayOfYear || 266
    const isNorthPole = latitude.value > 0

    sunData.forEach((d, i) => {
      const nextDayData = sunData[i + 1]
      if (!nextDayData) return

      const dayOfYear = i + 1
      let nightLeft = null
      let nightRight = null

      const isPolarNight = isNorthPole
        ? (dayOfYear < springDay || dayOfYear >= autumnDay)
        : (dayOfYear >= springDay && dayOfYear < autumnDay)

      if (isPolarNight) {
        nightLeft = 0
        nightRight = 24
      }

      nightBoundaries.push({
        dayOfYear,
        left: nightLeft,
        right: nightRight
      })
    })
  } else {
    // Use standard state machine for non-polar regions
    // Initialize based on hemisphere: northern starts in polar night (Jan=winter),
    // southern starts in polar day (Jan=summer)
    const isNorthernHemisphere = latitude.value >= 0
    let polarNight = isNorthernHemisphere
    let polarDay = !isNorthernHemisphere
    let polarDayEnd = false

    sunData.forEach((d, i) => {
      const nextDayData = sunData[i + 1]
      if (!nextDayData) return

      const dayOfYear = i + 1
      let sunset = d.error ? null : clip(timeToHours(d.sunset) + offset)
      let sunrise = nextDayData.error ? null : clip(timeToHours(nextDayData.sunrise) + offset)
      sunrise = !sunset ? null : sunrise
      sunset = !sunrise ? null : sunset
      if (sunset !== null && sunrise !== null && sunset > sunrise) {
        sunset = null
        sunrise = null
      }

      let nightLeft = null
      let nightRight = null

      if (sunset === null || sunrise === null) {
        if (polarNight) {
          nightLeft = 0
          nightRight = 24
        } else if (polarDayEnd) {
          polarNight = true
          polarDayEnd = false
          nightLeft = 0
          nightRight = 24
        } else {
          polarDay = true
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
  }

  // Find the best day for each phase (closest to nominal elongation)
  const phaseOccurrences = {}
  const phaseNames = Object.keys(moonPhaseNominalElongation)

  // Group moon data by phase name and find the best occurrence for each lunar cycle
  phaseNames.forEach(phaseName => {
    phaseOccurrences[phaseName] = []
  })

  // Track phase transitions to identify distinct lunar cycles
  let currentPhaseIndex = -1
  let cycleData = {}

  moonData.value.forEach((d, i) => {
    const phaseName = d.phaseName
    const phaseIndex = phaseNames.indexOf(phaseName)

    // Detect new lunar cycle (when we go from a later phase back to an earlier one)
    if (phaseIndex < currentPhaseIndex || (currentPhaseIndex === -1)) {
      // Save the best occurrences from the previous cycle
      phaseNames.forEach(name => {
        if (cycleData[name]) {
          phaseOccurrences[name].push(cycleData[name])
        }
      })
      cycleData = {}
    }
    currentPhaseIndex = phaseIndex

    const nominalElong = moonPhaseNominalElongation[phaseName]
    const elongDiff = Math.abs(d.elongation - nominalElong)

    // Keep track of the best (closest to nominal) occurrence for each phase in this cycle
    if (!cycleData[phaseName] || elongDiff < cycleData[phaseName].elongDiff) {
      cycleData[phaseName] = {
        data: d,
        dayIndex: i,
        elongDiff: elongDiff
      }
    }
  })

  // Don't forget the last cycle
  phaseNames.forEach(name => {
    if (cycleData[name]) {
      phaseOccurrences[name].push(cycleData[name])
    }
  })

  // Create traces for each phase occurrence (except New Moon)
  phaseNames.forEach(phaseName => {
    if (phaseName === 'New Moon') return // Skip new moon

    const occurrences = phaseOccurrences[phaseName]
    if (!occurrences || occurrences.length === 0) return

    const xValues = []
    const yValues = []
    const hoverTexts = []
    const customDatas = []

    occurrences.forEach(occ => {
      const d = occ.data
      const dayOfYear = getDayOfYear(d.date, isLeapYear)
      const boundary = nightBoundaries.find(b => b.dayOfYear === dayOfYear)

      if (!boundary || boundary.left === null || boundary.right === null) return

      // Calculate x position based on phase position fraction
      const positionFraction = moonPhasePosition[phaseName]
      const nightWidth = boundary.right - boundary.left
      const xPos = boundary.left + nightWidth * positionFraction

      xValues.push(xPos)
      yValues.push(dayOfYear)

      // Build hover text
      const riseText = d.moonrise ? shiftTime(d.moonrise, getTimeZone()) : 'N/A'
      const setText = d.moonset ? shiftTime(d.moonset, getTimeZone()) : 'N/A'
      hoverTexts.push(`Rise: ${riseText}<br>Set: ${setText}`)
      customDatas.push(formatDateStr(d.date))

      images.push({
        source: getMoonImageSrc(phaseName),
        x: xPos,
        y: dayOfYear,
        xref: 'x',
        yref: 'y',
        xanchor: 'center',
        yanchor: 'middle',
        sizex: 6,
        sizey: 6,
        sizing: 'contain',
        layer: 'above'
      })

    })

    if (xValues.length === 0) return

    // Create invisible markers for hover functionality (images provide the visual)
    traces.push({
      x: xValues,
      y: yValues,
      mode: 'markers',
      name: phaseName,
      marker: {
        symbol: 'circle',
        size: 20,
        color: 'rgba(0, 0, 0, 0)',  // Invisible marker
        line: {
          width: 0
        }
      },
      legendgroup: 'moon',
      showlegend: false,
      hovertemplate: `${phaseName}<br>%{customdata}<br>%{text}<extra></extra>`,
      customdata: customDatas,
      text: hoverTexts
    })
  })

  // Add a single legend entry for Moon
  traces.push({
    x: [null],
    y: [null],
    mode: 'markers',
    name: 'Moon',
    marker: {
      symbol: 'circle',
      size: 10,
      color: 'gold',
      line: {
        color: 'goldenrod',
        width: 1
      }
    },
    legendgroup: 'moon',
    showlegend: true
  })

  return [traces, images]
}

const getMoonImageSrc = (phaseName) => {
  const r = 10;
  const k = 0.552; // Bezier approximation constant for circular arcs

  // Full circle path for shadow/dark side
  const fullCircle = `M 0,-${r} C ${r*k},-${r} ${r},-${r*k} ${r},0 C ${r},${r*k} ${r*k},${r} 0,${r} C -${r*k},${r} -${r},${r*k} -${r},0 C -${r},-${r*k} -${r*k},-${r} 0,-${r} Z`;

  let litPath = '';

  switch (phaseName) {
    case 'New Moon':
      // Only shadow, no lit portion
      litPath = '';
      break;

    case 'Full Moon':
      // Entire moon is lit
      litPath = fullCircle;
      break;

    case 'First Quarter':
      // Right half lit
      litPath = `M 0,-${r}
           C ${r*k},-${r} ${r},-${r*k} ${r},0
           C ${r},${r*k} ${r*k},${r} 0,${r}
           L 0,-${r} Z`;
      break;

    case 'Last Quarter':
      // Left half lit
      litPath = `M 0,-${r}
           L 0,${r}
           C -${r*k},${r} -${r},${r*k} -${r},0
           C -${r},-${r*k} -${r*k},-${r} 0,-${r} Z`;
      break;

    case 'Waxing Crescent':
      // Thin crescent on right side
      litPath = `M 0,-${r}
           C ${r*k},-${r} ${r},-${r*k} ${r},0
           C ${r},${r*k} ${r*k},${r} 0,${r}
           C ${r*0.3},${r*0.8} ${r*0.5},${r*0.4} ${r*0.5},0
           C ${r*0.5},-${r*0.4} ${r*0.3},-${r*0.8} 0,-${r} Z`;
      break;

    case 'Waning Crescent':
      // Thin crescent on left side
      litPath = `M 0,-${r}
           C -${r*0.3},-${r*0.8} -${r*0.5},-${r*0.4} -${r*0.5},0
           C -${r*0.5},${r*0.4} -${r*0.3},${r*0.8} 0,${r}
           C -${r*k},${r} -${r},${r*k} -${r},0
           C -${r},-${r*k} -${r*k},-${r} 0,-${r} Z`;
      break;

    case 'Waxing Gibbous':
      // Most of moon lit except small crescent on left
      litPath = `M 0,-${r}
           C ${r*k},-${r} ${r},-${r*k} ${r},0
           C ${r},${r*k} ${r*k},${r} 0,${r}
           C -${r*0.3},${r*0.8} -${r*0.5},${r*0.4} -${r*0.5},0
           C -${r*0.5},-${r*0.4} -${r*0.3},-${r*0.8} 0,-${r} Z`;
      break;

    case 'Waning Gibbous':
      // Most of moon lit except small crescent on right
      litPath = `M 0,-${r}
           C ${r*0.3},-${r*0.8} ${r*0.5},-${r*0.4} ${r*0.5},0
           C ${r*0.5},${r*0.4} ${r*0.3},${r*0.8} 0,${r}
           C -${r*k},${r} -${r},${r*k} -${r},0
           C -${r},-${r*k} -${r*k},-${r} 0,-${r} Z`;
      break;

    default:
      litPath = fullCircle;
  }

  // Build SVG with shadow circle behind and lit portion on top
  const shadowPath = `<path d="${fullCircle}" fill="#404050" stroke="goldenrod" stroke-width="0.5"/>`;
  const litPathElement = litPath ? `<path d="${litPath}" fill="gold" stroke="none"/>` : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 24 24">
                ${shadowPath}
                ${litPathElement}
               </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
};

// Split data arrays at discontinuities (large jumps)
const splitDataAtDiscontinuities = (xValues, yValues, dates, texts, azimuths = null, altitudes = null) => {
  const segments = []
  let currentSegment = { x: [], y: [], dates: [], texts: [], azimuths: [], altitudes: [] }

  for (let i = 0; i < xValues.length; i++) {
    if (currentSegment.x.length === 0) {
      currentSegment.x.push(xValues[i])
      currentSegment.y.push(yValues[i])
      currentSegment.dates.push(dates[i])
      currentSegment.texts.push(texts[i])
      if (azimuths) currentSegment.azimuths.push(azimuths[i])
      if (altitudes) currentSegment.altitudes.push(altitudes[i])
    } else {
      const lastX = currentSegment.x[currentSegment.x.length - 1]
      const lastY = currentSegment.y[currentSegment.y.length - 1]
      // Check for discontinuity (x jump > 12 hours or y jump > 1 day)
      if (Math.abs(xValues[i] - lastX) > 12 || Math.abs(yValues[i] - lastY) > 1) {
        if (currentSegment.x.length > 0) {
          segments.push(currentSegment)
        }
        currentSegment = { x: [], y: [], dates: [], texts: [], azimuths: [], altitudes: [] }
      }
      currentSegment.x.push(xValues[i])
      currentSegment.y.push(yValues[i])
      currentSegment.dates.push(dates[i])
      currentSegment.texts.push(texts[i])
      if (azimuths) currentSegment.azimuths.push(azimuths[i])
      if (altitudes) currentSegment.altitudes.push(altitudes[i])
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
  let h = Math.floor(hours)
  let m = Math.round((hours - h) * 60)
  if (m >= 60) {
    m = 0
    h++
    if (h >= 24) {
      h = 0
    }
  }
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}}`
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
    hovertemplate: 'Sunset<br>%{customdata}<br>%{text}<br>Azimuth: %{meta}<extra></extra>',
    customdata: yValues.map(day => formatDay(day)),
    text: data.slice(0, -1).map(d => d.error ? "" : shiftTime(d.sunset, getTimeZone())),
    meta: data.slice(0, -1).map(d => d.error ? "" : (d.sunsetAzimuth != null ? `${d.sunsetAzimuth.toFixed(1)}°` : "N/A"))
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
    hovertemplate: 'Sunrise<br>%{customdata}<br>%{text}<br>Azimuth: %{meta}<extra></extra>',
    customdata: yValues.map(day => formatDay(day)),
    text: data.slice(1).map(d => d.error ? "" : shiftTime(d.sunrise, getTimeZone())),
    meta: data.slice(1).map(d => d.error ? "" : (d.sunriseAzimuth != null ? `${d.sunriseAzimuth.toFixed(1)}°` : "N/A"))
  }

  // Create night duration bars (horizontal lines between curves)
  const nightBars = []

  // Check if we should use equinox-based polar logic
  const usePolarEquinoxLogic = Math.abs(latitude.value) > 89.4 && equinoxData.value

  if (usePolarEquinoxLogic) {
    // Use equinox data for polar regions
    const springDay = equinoxData.value.springEquinox?.dayOfYear || 80
    const autumnDay = equinoxData.value.autumnEquinox?.dayOfYear || 266
    const isNorthPole = latitude.value > 0

    sunsetXValues.forEach((sunsetX, i) => {
      const dayOfYear = yValues[i]

      // For North Pole: polar night before spring equinox and after autumn equinox
      // For South Pole: polar night between spring and autumn equinox
      const isPolarNight = isNorthPole
        ? (dayOfYear < springDay || dayOfYear >= autumnDay)
        : (dayOfYear >= springDay && dayOfYear < autumnDay)

      if (isPolarNight) {
        nightBars.push({
          x: [plotLeft, plotRight],
          y: [dayOfYear, dayOfYear],
          mode: 'lines',
          line: {
            color: 'rgba(200, 200, 255, 0.3)',
            width: 1
          },
          showlegend: false,
          hoverinfo: 'skip'
        })
      }
      // During polar day, no night bar is added
    })
  } else {
    // Use standard state machine for non-polar regions
    // Initialize based on hemisphere: northern starts in polar night (Jan=winter),
    // southern starts in polar day (Jan=summer)
    const isNorthernHemisphere = latitude.value >= 0
    let polarNight = isNorthernHemisphere
    let polarDay = !isNorthernHemisphere
    let polarDayEnd = false

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
      if (sunsetX !== null && sunriseX !== null) {
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
      }
    })
  }

  // Create planet traces
  const planetTraces = createPlanetTraces(data, offset)

  // Create moon traces
  const [moonTraces, moonImages] = createMoonTracesAndImages(data, offset)

  const traces = [sunsetTrace, sunriseTrace, ...nightBars, ...planetTraces, ...moonTraces]

  // Create month labels and dividers
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const shapes = []
  const images = [...moonImages]
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
    title: `Sun, Planets & Moon for ${year.value} (Lat: ${latitude.value.toFixed(4)}°, Lon: ${longitude.value.toFixed(4)}°)`,
    xaxis: {
      title: {
        text: 'Time',
        standoff: 10
      },
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
    images: images,
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
      l: 60,
      r: 20,
      t: 60,
      b: 40
    }
}

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false
  }

  Plotly.newPlot(plotContainer.value, traces, layout, config).then(() => {
    // Force resize after initial render to fix container height issues
    setTimeout(() => {
      Plotly.Plots.resize(plotContainer.value)
    }, 100)
  })
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const clip = (n) => {
    return (n % 24 + 24) % 24
}

function shiftTime(timeStr, hours) {
    const [h, m, s] = timeStr.split(':').map(Number);
    const totalSeconds = (h * 3600 + m * 60 + s) + hours * 3600;
    const normalized = ((totalSeconds % 86400) + 86400) % 86400; // Keep in 0–86399
    let hh = Math.floor(normalized / 3600);
    let mm = Math.round((normalized % 3600) / 60);
    if (mm >= 60) {
        mm = 0
        hh++
        if (hh >= 24) {
            hh = 0
        }
    }

    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
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
  padding: 8px;
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
