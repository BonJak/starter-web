const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')
const cheerio = require('cheerio');
const axios = require('axios');
const rax = require('retry-axios');
const interceptorId = rax.attach();
const fs = require('fs');
const cloudinary = require('cloudinary').v2
const {MongoClient} = require('mongodb')
cloudinary.config({
	cloud_name: 'dm3wncvtq',
	api_key: '382451538874236',
	api_secret: 'RmGOy1RjSNGpg3r76BrVerAerIo'
});
cloudinary.uploader.upload_stream({})
let baseURL = 'https://www.ozdisan.com'
const mongoDbUri = 'mongodb+srv://bonJak:JFqput83@ozzy.gxgr0.mongodb.net/?retryWrites=true&w=majority'

// puppeteer.use(AdblockerPlugin({blockTrackers: true}))
// puppeteer.use(StealthPlugin())
const client = new MongoClient(mongoDbUri, { useUnifiedTopology: true })

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

const gatherObj = (arr) => {
	const temp = {}
	arr.forEach((item, i) => {
		Object.keys(item).map((k) => temp[k] = item[k])
	})
	return temp
}

const scrapeCategories = async (page) => {
	const $ = cheerio.load(page)
	return $('#layoutYeni > div > div:nth-child(3) > div > div > div > div > a ').map((i, cat) => {
		return `https://www.ozdisan.com${$(cat).attr("href")}`
	}).get()
}
const parseProductUrls = async (currentPageUrl) => {
	const {data} = await axios.get(currentPageUrl)
	const $ = cheerio.load(data)
	const productUrls = []
	$('#prdTable > tbody > tr > td:nth-child(3) > a').each((i, e) => {
		productUrls.push(`${baseURL}${$(e).attr('href')}`)
	})
	return productUrls;
}
const parseCategoryUrl = async (currentCategoryUrl) => {
	const {data} = await axios.get(currentCategoryUrl)
	const $ = cheerio.load(data)
	const productCount = $('#odak > div.col-xs-12.col-md-8.col-lg-8 > p > span.lblTotalCount').text().trim()
	const pagesRequired = Math.ceil(productCount / 250)
	let allProductUrls = []
	for (let i = 1; i <= pagesRequired; i++) {
		const currentPageUrl = `${currentCategoryUrl}?page=${i}&sayfaAdedi=250`;
		const productUrls = await parseProductUrls(currentPageUrl)
		allProductUrls = [...allProductUrls, ...productUrls]
	}
	console.log("length of in a category", allProductUrls.length)
	return allProductUrls
}
const parse4Category = async (url) => {
	const {data} = await axios.get(url)
	const $ = cheerio.load(data)
	let categories = []
	$('#layoutYeni > div:nth-child(9) > div:nth-child(2) > div > a > span').each((i, e) => {
		if (i > 1)
			categories.push($(e).text().trim())
	})
	categories.pop()
	return categories
}
const parseMain = (html, tElement) => {
	const $ = cheerio.load(html)
	const specs = $(tElement).children().children().filter((i, e) => i % 2 === 1 && i !== 7 && i !== 9 && i < 15)
		.map((id, el) => {
			switch (id) {
				case 0:
					return {partNumber: $(el).text().trim()}
				case 1:
					return {description: $(el).text().trim()}
				case 2:
					return {quantity: $(el).text().trim()}
				case 3:
					return {MPQ: $(el).text().trim()}
				case 4:
					return {MOQ: $(el).text().trim()}
				default:
					break;
			}
		}).get()
	return gatherObj(specs)
}
const parsePrice = (html, e) => {
	const $ = cheerio.load(html)
	const price = $(e).children().map((id, el) => {
		const mid = $(el).children().map((idx, element) => {
			switch (idx) {
				case 0:
					return {unit: $(element).text().trim()}
				case 1:
					return {unitPriceUsd: $(element).text().trim()}
				case 2:
					return {unitPriceTl: $(element).text().trim()}
			}
		}).get()
		return gatherObj(mid)
	}).get()
	return price
}
const parseFeatures = (html, e) => {
	const $ = cheerio.load(html)
	let keys = []
	let values = []
	$(e).children().filter((id, el) => id !== 0).each((idx, elem) => {
		$(elem).children().each((index, element) => {
			if (index % 3 === 2) {
				return
			} else if (index % 3 === 0) {
				keys.push($(element).text().trim().replace('↵', '').toString())
			} else if (index % 3 === 1) {
				values.push($(element).text().trim().replace('↵', '').toString())
			}
		})
	})
	keys.pop();
	values.pop();
	const extra = {}
	keys.map((key, i) => {
		extra[key] = values[i]
	})
	return extra;
}
const parseTable = async (html) => {
	const $ = cheerio.load(html)
	let product = {}
	$('div.panel-body table tbody').map((i, e) => {
		switch (i) {
			case 0:
				const specs = parseMain(html, e);
				product = {...specs}
				break;
			case 1:
				const price = parsePrice(html, e);
				product.price = price
				break;
			case 2:
				const features = parseFeatures(html, e);
				product.extra = features
				break;
			default:
				break
		}
	}).get()
	return product
}
const parseImageUrl = async (html, imgName) => {
	const $ = cheerio.load(html)
	const imageUrl = $('.productImage').attr('href')
	const cleanImgName = imgName.replace(new RegExp('[/%\*\\\" ]', 'mg'), '')
	const {data} = await axios.get(`${imageUrl}`, {
		responseType: 'stream'
	})
	const createStream = () => new Promise((resolve) => {
		let writer = fs.createWriteStream(`./images/${cleanImgName}.jpg`);
		data.pipe(writer);
		writer.on('finish', resolve);
	});
	await createStream()
	return {cleanImgName}
}
const uploadImage = async (imageName) => {
	try {
		let cloudResponse = {}
		let cleanImgName = imageName.replace('[/()%\" ]', '')
		await cloudinary.uploader.upload(`./images/${cleanImgName}.jpg`, {public_id: `Ozzy/${cleanImgName}`}, (err, res) => {
			cloudResponse = res;
		})
		return cloudResponse.secure_url
	} catch (e) {
		console.log("error num1", e)
	}
}
const parseDatasheetUrl = async (html) => {
	const $ = cheerio.load(html)
	return $('#layoutYeni > div:nth-child(10) > div > div > div > div.col-xs-12 >' +
		' div.col-md-3.col-sm-12.col-xs-12 >' +
		' div:nth-child(2) > div > div.col-md-12 > a').attr('href')
}
const downloadDataSheet = async (url, imgName) => {
	const {data} = await axios.get(`${url}`, {
		responseType: 'stream'
	})
	const createStream = () => new Promise((resolve) => {
		let writer = fs.createWriteStream(`./datasheet/${imgName}.pdf`);
		data.pipe(writer);
		writer.on('finish', resolve);
	});
	await createStream()
}
const scrapeProductPage = async (prdUrl, index) => {
	const {data} = await axios.get(prdUrl, {timeout: 5000})
	let product = await parseTable(data)
	const {cleanImgName} = await parseImageUrl(data, product.partNumber)
	const imgUrl = await uploadImage(cleanImgName)
	const datasheetUrl = await parseDatasheetUrl(data)
	await downloadDataSheet(datasheetUrl, cleanImgName)
	product.imgUrl = imgUrl;
	product.datasheetUrl = datasheetUrl
	return {product}
}
const saveToMongo = async (product) => {
	try {
		const db = await client.db('Ozzy');
		const coll = await db.collection('products');
		const jsonProduct = {...product}
		return await coll.insertOne(jsonProduct);
	} catch (e) {
		console.log(e)
	}
}
let start = 1
let end = 10

async function main() {
	try {
		const {data} = await axios.get(`${baseURL}/Category/Products`)
		const categoryUrls = await scrapeCategories(data)
		let pdCopy = {}
		await client.connect()
		for (let i = start; i < end; i++) {
			try {
				const allProductUrls = await parseCategoryUrl(categoryUrls[i])
				const categories = await parse4Category(allProductUrls[0])
				for (let j = 0; j < allProductUrls.length; j++) {
					let {product} = await scrapeProductPage(allProductUrls[j], j);
					pdCopy = {...product}
					product.categories = categories
					product.i = j
					await saveToMongo(product)
					await sleep(500)
					console.log(product.i,product.categories)
				}
			} catch (e) {
				console.log(e)
				pdCopy.i = i;
				try {
					await fs.promises.appendFile('errors.txt', JSON.stringify(pdCopy))
				} catch (e) {
					console.log(e)
				}
			}
		}
	} catch (e) {
		console.log("error numb 3", e)
	} finally {
		console.log("fsdlkjf;laskjd")
		await client.close()
	}
}

main()
