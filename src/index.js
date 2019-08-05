const csvParse = require('csv-parse')
const fs = require('fs-extra')
const handlebars = require('handlebars')
const path = require('path')
const puppeteer = require('puppeteer')

const compile = async (template, data) => {
  const filePath = path.join(process.cwd(), 'templates', `${template}.hbs`)
  const html = await fs.readFile(filePath, 'utf-8')
  return handlebars.compile(html)(data)
}

const main = async () => {
  try {
    const browser = await puppeteer.launch()
    const page = await browser.newPage()

    const content = await compile('index', {})

    await page.setContent(content)
    await page.emulateMedia('print')

    await page.pdf({
      path: 'MyPDF.pdf',
      format: 'A4',
      printBackground: true
    })

    console.log('Done')

    await browser.close()
    process.exit()

  } catch (error) {
    console.log(error)
  }
}

main()
