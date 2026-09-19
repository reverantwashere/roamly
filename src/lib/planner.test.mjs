import assert from 'node:assert/strict'
import test from 'node:test'
import { destinations } from './data.ts'
import { buildItinerary, fuelCost, remainingRange, splitExpense } from './planner.ts'

test('fuel and range calculators preserve units and support empty fuel', () => {
  assert.equal(fuelCost(350, 35, 2), 20)
  assert.equal(fuelCost(0, 20, 2), 0)
  assert.equal(remainingRange(40, 25, 20), 200)
  assert.equal(remainingRange(40, 0, 20), 0)
  assert.equal(splitExpense(7000, 4), 1750)
})

test('invalid denominators and impossible user inputs are rejected', () => {
  for (const mileage of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => fuelCost(100, mileage, 2), RangeError)
  }
  assert.throws(() => fuelCost(-1, 20, 2), RangeError)
  assert.throws(() => remainingRange(50, 101, 20), RangeError)
  assert.throws(() => remainingRange(0, 50, 20), RangeError)
  assert.throws(() => splitExpense(50, 0), RangeError)
  assert.throws(() => splitExpense(50, 1.5), RangeError)
})

test('planner uses destination landmarks and adapts morning times to selected style', () => {
  const munnar = destinations.find((destination) => destination.id === 'munnar')
  const quiet = buildItinerary(munnar, 3, 'Introvert', 'balanced', 1)
  const social = buildItinerary(munnar, 3, 'Extrovert', 'balanced', 1)
  assert.equal(quiet.length, 3)
  assert.equal(quiet[0].activities[0].title, 'Tea garden viewpoints')
  assert.equal(quiet[0].activities[0].time, '07:30')
  assert.equal(social[0].activities[1].title, 'Munnar town')
  assert.equal(social[0].activities[1].time, '13:00')
  assert.equal(social[0].activities[0].time, '09:00')
  assert.ok(quiet.every((day) => day.activities.every((activity) => activity.provenance === 'Estimated')))
})

test('group estimates scale by people and stay within the daily allowance', () => {
  const solo = buildItinerary(destinations[0], 2, 'Ambivert', 80, 1)
  const group = buildItinerary(destinations[0], 2, 'Ambivert', 80, 4)
  assert.equal(group[0].activities[0].cost, solo[0].activities[0].cost * 4)
  assert.ok(group.every((day) => day.activities.reduce((total, activity) => total + activity.cost, 0) <= 80 * 4))
  assert.throws(() => buildItinerary(destinations[0], 0), RangeError)
  assert.throws(() => buildItinerary(destinations[0], 1.5), RangeError)
  assert.throws(() => buildItinerary(destinations[0], 1, 'Ambivert', -1), RangeError)
})

test('numeric budgets are allocated in the selected currency without implied conversion', () => {
  const yen = buildItinerary(destinations[1], 1, 'Ambivert', 10000, 2, 'JPY')
  assert.equal(yen[0].activities[0].cost, 2400)
  assert.equal(yen[0].activities[0].currency, 'JPY')
  assert.equal(yen[0].activities[0].costLabel, 'Estimated budget allocation')
  const baseline = buildItinerary(destinations[1], 1, 'Ambivert', 'balanced', 1, 'JPY')
  assert.equal(baseline[0].activities[0].currency, 'INR')
})

test('Kerala catalogue uses local INR estimates while the schema allows other currencies', () => {
  assert.ok(destinations.length >= 20)
  assert.ok(destinations.every((destination) => destination.region === 'Kerala' && destination.country === 'India' && destination.costCurrency === 'INR'))
  const local = buildItinerary(destinations[0], 1)
  assert.equal(local[0].activities[0].currency, 'INR')
  const legacy = { ...destinations[0], costCurrency: undefined, costPerDay: 50 }
  assert.equal(buildItinerary(legacy, 1)[0].activities[0].currency, 'USD')
})

test('every catalogue destination has a specific itinerary instead of generic filler', () => {
  for (const destination of destinations) {
    const titles = buildItinerary(destination, 2, 'Ambivert', 'balanced', 1)
      .flatMap((day) => day.activities.map((activity) => activity.title))
    assert.ok(!titles.includes(`${destination.name} at your pace`), `${destination.name} used the generic planner fallback`)
    assert.ok(!titles.includes('Discover the neighbourhood'), `${destination.name} used the generic planner fallback`)
  }
})

test('longer stays do not recycle curated stops or fabricate extra visits', () => {
  for (const destination of destinations) {
    for (const group of ['Solo', 'Family']) {
      const itinerary = buildItinerary(destination, 30, 'Ambivert', 2500, 1, 'INR', group)
      const titles = itinerary.flatMap((day) => day.activities.map((activity) => activity.title))
      assert.equal(itinerary.length, 30)
      assert.equal(new Set(titles).size, titles.length, `${destination.name} repeats a stop`)
      assert.ok(itinerary[0].activities.length > 0)
      assert.ok(itinerary.at(-1).activities.length === 0)
      assert.match(itinerary.at(-1).note, /no further curated stops/)
      assert.ok(itinerary.every((day) => day.activities.length > 0 || day.note))
    }
  }
})

test('style and family scheduling keep morning, lunch and evening stops in suitable windows', () => {
  for (const destination of destinations) {
    for (const style of ['Introvert', 'Extrovert', 'Adventure-seeking', 'Ambivert']) {
      for (const group of ['Solo', 'Family']) {
        const activities = buildItinerary(destination, 7, style, 2500, 2, 'INR', group)
          .flatMap((day) => day.activities)
        for (const activity of activities) {
          if (/sunset|evening/i.test(activity.title)) {
            assert.ok(activity.time >= '17:00', `${activity.title} was scheduled at ${activity.time}`)
          }
          if (/morning/i.test(activity.title)) {
            assert.ok(activity.time < '12:00', `${activity.title} was scheduled at ${activity.time}`)
          }
          if (/lunch/i.test(activity.title)) {
            assert.ok(activity.time >= '11:00' && activity.time < '16:00', `${activity.title} was scheduled at ${activity.time}`)
          }
        }
      }
    }
  }
})

test('a Silent Valley forest excursion reserves enough time and is not split into separate tours', () => {
  const destination = destinations.find((place) => place.id === 'silent-valley')
  for (const group of ['Solo', 'Family']) {
    const itinerary = buildItinerary(destination, 2, 'Extrovert', 2500, 2, 'INR', group)
    assert.equal(itinerary[0].activities[0].title, 'Sairandhri guided excursion')
    assert.ok(itinerary[0].activities[0].time < '12:00')
    assert.ok(itinerary[0].activities.slice(1).every((activity) => activity.time >= '17:00'))
    assert.deepEqual(itinerary[1].activities, [])
    assert.match(itinerary[1].note, /no further curated stops/)
  }
})

test('family trips leave more breathing room and request facility checks without claiming accessibility', () => {
  const family = buildItinerary(destinations[0], 2, 'Ambivert', 2500, 4, 'INR', 'Family')
  const friends = buildItinerary(destinations[0], 2, 'Ambivert', 2500, 4, 'INR', 'Friends')
  assert.equal(family[0].activities.length, 2)
  assert.equal(friends[0].activities.length, 3)
  assert.equal(family[0].activities[0].time, '09:00')
  assert.match(family[0].activities[0].description, /rest breaks; confirm step-free access/)
  assert.match(friends[0].activities[0].description, /meeting point/)
})
