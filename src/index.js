const parse = require('csv-parse')
const fs = require('fs-extra')
const handlebars = require('handlebars')
const moment = require('moment')
const path = require('path')
const prompt = require('prompt')
const puppeteer = require('puppeteer')

const constants = require('./constants')

const compile = async (template, data) => {
  const filePath = path.join(process.cwd(), 'templates', `${template}.hbs`)
  const html = await fs.readFile(filePath, 'utf-8')
  return handlebars.compile(html)(data)
}

const getCSV = async (filename) => {
  const filePath = path.join(process.cwd(), `${filename}.csv`)
  const csv = await fs.readFile(filePath, 'utf-8')
  return csv
}

const getDate = original => {
  const date = moment(original, constants.dateFormat)
  const text = date.isValid() ? date.format(constants.dateFormat) : `${original} (!)`
  return { text, date, original }
}

const getTotal = locations => {
  const total = locations.reduce((total, location) => {
    return total + location.calculationCost
  }, 0)
  return parseFloat(total).toFixed(2)
}

const sortRecords = (aRecord, bRecord) => {
  const aDate = aRecord.date.date
  const bDate = bRecord.date.date
  if (!aDate.isValid()) {
    console.log(`Warning: Invalid date found for '${aRecord.name}': ${aRecord.date.original}`)
    return 1
  }
  if (!bDate.isValid()) {
    console.log(`Warning: Invalid date found for '${bRecord.name}': ${bRecord.date.original}`)
    return -1
  }
  if (aDate.isBefore(bDate)) return -1
  else if (aDate.isAfter(bDate)) return 1
  else {
    const aName = aRecord.name
    const bName = bRecord.name
    return aName.localeCompare(bName)
  }
}

const sortLocations = (aLocation, bLocation) => {
  return aLocation.order - bLocation.order
}

const castFunction = (value, context) => {
  const column = context.column
  if (typeof (column) === 'string') {
    let castValue
    if (column === constants.fields.name) castValue = value
    else if (column === constants.fields.location) castValue = value
    else if (column === constants.fields.date) castValue = getDate(value)
    else if (column === constants.fields.referenceNumber) castValue = value
    return castValue
  } else {
    return value
  }
}

const getLocations = output =>
  output
    .reduce((locations, record) => {
      let newLocations
      const currentRecord = {
        name: record[constants.fields.name],
        location: record[constants.fields.location],
        date: record[constants.fields.date],
        reference: record[constants.fields.referenceNumber]
      }
      const existingLocationIndex = locations.findIndex(record => record.location === currentRecord.location)
      if (existingLocationIndex >= 0) {
        locations.splice(existingLocationIndex, 1, Object.assign({}, locations[existingLocationIndex], {
          records: locations[existingLocationIndex].records.concat(currentRecord)
        }))
        newLocations = locations
      } else {
        newLocations = locations.concat({ location: currentRecord.location, records: [currentRecord] })
      }
      return newLocations
    }, [])
    .map(location => {
      const locationConstant = constants.locations[location.location]
      const name = locationConstant.name
      const order = locationConstant.order
      const count = location.records.length
      const calculationRate = locationConstant.rate
      const rate = parseFloat(calculationRate).toFixed(2)
      const calculationCost = count * calculationRate
      const cost = parseFloat(calculationCost).toFixed(2)
      const records = location.records.sort(sortRecords)
      return Object.assign({}, location, { calculationCost, count, cost, name, order, rate, records })
    })
    .sort(sortLocations)

const main = async () => {
  try {
    prompt.start()

    const schema = {
      properties: {
        filename: {
          required: true
        },
        report: {
          required: true
        }
      }
    }

    const parserSettings = {
      bom: true,
      cast: castFunction,
      columns: true,
      delimiter: ','
    }

    prompt.get(schema, async (promptError, result) => {
      const filename = result.filename
      const report = result.report

      const csv = await getCSV(filename)

      parse(csv, parserSettings, async (parsingError, output) => {
        if (parsingError) throw new Error('Parsing error')

        const locations = getLocations(output)
        const total = getTotal(locations)

        const browser = await puppeteer.launch()
        const page = await browser.newPage()

        const date = moment().format(constants.dateFormat)

        const content = await compile('index', { date, report, locations, total })

        await page.setContent(content)
        await page.emulateMedia('print')

        await page.pdf({
          path: `${report}.pdf`,
          format: 'A4',
          printBackground: true
        })

        console.log(`File outputted: ${report}.pdf`)

        await browser.close()
        process.exit()
      })
    })
  } catch (error) {
    console.log(error)
  }
}

main()
