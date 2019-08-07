const parse = require('csv-parse')
const fs = require('fs-extra')
const handlebars = require('handlebars')
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

const getLocations = output =>
  output
    .reduce((locations, record) => {
      let newLocations
      const currentRecord = {
        name: record['Name'],
        location: record['Location'],
        date: record['Date'],
        reference: record['Reference Number']
      }
      const existingLocationIndex = locations.findIndex(record => record.location === currentRecord.location)
      if (existingLocationIndex >= 0) {
        locations.splice(existingLocationIndex, 1, Object.assign({}, locations[existingLocationIndex], {
          records: locations[existingLocationIndex].records.concat(currentRecord)
        }))
        newLocations = locations
      } else {
        newLocations = locations.concat({location: currentRecord.location, records: [currentRecord]})
      }
      return newLocations
    }, [])
    .map(location => {
      const count = location.records.length
      const rate = constants.locations[location.location]
      const cost = count * rate
      return Object.assign({}, location, { count, cost, rate })
    })

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
      cast: true,
      columns: true,
      delimiter: ','
    }

    prompt.get(schema, async (promptError, result) => {
      const filename = result.filename
      const report = result.report

      const csv = await getCSV(filename)

      parse(csv, parserSettings, async (parsingError, output) => {
        if (parsingError) throw new Exception('Parsing error')

        const locations = getLocations(output)

        const browser = await puppeteer.launch()
        const page = await browser.newPage()
    
        const content = await compile('index', {report, locations})
    
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
