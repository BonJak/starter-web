const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const async = require('async');
const cloudinary = require('cloudinary').v2
const {MongoClient} = require('mongodb')
cloudinary.config({
	cloud_name: 'dm3wncvtq',
	api_key: '382451538874236',
	api_secret: 'RmGOy1RjSNGpg3r76BrVerAerIo'
});
cloudinary.uploader.upload_stream({}, function (error, result) {
	console.log("number 1 ", result)
})
let scraped_baseURL = 'https://www.javanelec.com'
let currentPage = `https://www.javanelec.com/Shops/ProductDetail`;
const mongoDbUri = 'mongodb+srv://bonJak:JFqput83@javanelec.nrqo1.mongodb.net/?retryWrites=true&w=majority'
const totalNumberOfProduct = 41635;
const client1 = new MongoClient(mongoDbUri)

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

const parsePrice = async (html) => {
	const $ = cheerio.load(html)

	return $('div.text-danger + div').map((i, el) => {
		return {price: $(el).text().trim().replace('  ریال', '')}
	}).get()

}
const parseCategory = async (html) => {
	const $ = cheerio.load(html)
	const categories = []
	const cats = $('.tag-success').each((index, el) => {
		categories.push($(el).text().trim().replace('↵', ''))
	})
	return categories;

}
const parseTable = async (html) => {
	const $ = cheerio.load(html)
	const specs = $('.table.table-div > div').map((index, row) => {
		const rowsValue = $(row).children().map((i, col) => {
			switch (index) {
				case 0:
					if (i === 1)
						return {partNumber: $(col).text().trim()}
					break;
				case 1:
					if (i === 1)
						return {partNumberMfc: $(col).text().trim()}
					break;
				case 2:
					if (i === 1)
						return {groupCategory: $(col).text().trim()}
					break;
				case 3:
					if (i === 1)
						return {brand: $(col).text().trim()}
					break;
				case 4:
					if (i === 1)
						return {packageName: $(col).text().trim()}
					break;
				case 6:
					if (i === 1)
						return {packaging: $(col).text().trim()}
					break;
				case 7:
					if (i === 1)
						return {PQ: $(col).text().trim()}
					break;
				case 9:
					if (i === 1)
						return {MOQ: $(col).text().trim()}
					break;
				case 10:
					if (i === 1)
						return {multiplier: $(col).text().trim()}
					break;
				case 11:
					if (i === 1)
						return {unit: $(col).text().trim()}
					break;
				default:
					break;
			}
		}).get()
		return rowsValue;
	}).get()
	const info = {}
	specs.forEach((item, i) => {
		Object.keys(item).map((spec) => info[spec] = item[spec])
	})
	let keys = [];
	let values = [];
	$('#feature_tab > table > tbody > tr > td').each((i, el) => {
		if (i % 3 === 2) {
			return
		} else if (i % 3 === 0) {
			keys.push($(el).text().trim().replace('↵', '').toString())
		} else if (i % 3 === 1) {
			values.push($(el).text().trim().replace('↵', '').toString())
		}
	})
	info.extra = {}
	keys.map((key, i) => {
		info.extra[key] = values[i]
	})
	return info
}
const parseDescription = async (html) => {
	const $ = await cheerio.load(html)
	return $('.bg-faded.text-xs-left.padding-sm.buffer-sm').text().trim()
}

async function parseImageUrl(html) {
	const $ = await cheerio.load(html)
	const imgElement = $('.align-middle.inline-block.max-height100.max-width100')
	const imgName = imgElement.attr('title')
	const imgUrl = imgElement.attr('src')
	const cleanImgName = imgName.replace(new RegExp('[/%\*\\\" ]', 'mg'), '')
	const {data} = await axios.get(`https://www.javanelec.com${imgUrl}`, {
		responseType: 'stream'
	})
	const createStream = () => new Promise((resolve) => {
		let writer = fs.createWriteStream(`./javanelecImgs/${cleanImgName}.jpg`);
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
		await cloudinary.uploader.upload(`./javanelecImgs/${cleanImgName}.jpg`, {public_id: `javanElectronic/${cleanImgName}`}, (err, res) => {
			cloudResponse = res;
		})
		return cloudResponse.secure_url
	} catch (e) {
		console.log("error num1", e)
	}
}
const parseDataSheetUrl = (html) => {
	const $ = cheerio.load(html)
	const datasheetUrl = `${scraped_baseURL}${$('.btn-primary-outline').attr('onclick').match(/\'['\w\/\-\?\=\&]+/m)[0].replace(/\'/gm, '')}`;

	return datasheetUrl
}
const downloadDataSheet = async (url, imgName) => {
	const {data} = await axios.get(`${url}`, {
		responseType: 'stream'
	})
	const createStream = () => new Promise((resolve) => {
		let writer = fs.createWriteStream(`./datasheetJavanElec/${imgName}.pdf`);
		data.pipe(writer);
		writer.on('finish', resolve);
	});
	await createStream()
}

async function scrapeProductPage(page) {
	const html = await page.content();

	const price = await parsePrice(html);
	const categories = await parseCategory(html);
	const info = await parseTable(html);
	const description = await parseDescription(html);
	const {cleanImgName} = await parseImageUrl(html)
	const imgUrl = await uploadImage(cleanImgName)
	const dataSheetUrl = await parseDataSheetUrl(html)
	await downloadDataSheet(dataSheetUrl, cleanImgName)
	const product = {
		...info,
		categories,
		description,
		price,
		imgUrl,
		dataSheetUrl,
	}
	console.log("final Product", product)
	return product;
}

const updateDatabase = async (product, dbn) => {
	try {
		const db = client1.db('javanElec');
		const coll = db.collection('products');
		const jsonProduct = {...product}
		const result = await coll.insertOne(jsonProduct)
	} catch (e) {
		console.log("number 2 err", e)
	}
}
const ms1 = 12905;
const me1 = 20000;

async function main1() {
	try {
		const browser = await puppeteer.launch({headless: true});
		const page = await browser.newPage();
		let product = {}
		await client1.connect();
		for (let i = ms1; i <= me1; i++) {
			try {
				await page.goto(`${currentPage}/${i}`, {waitUntil: 'networkidle2'});
				product = await scrapeProductPage(page)
				await updateDatabase(product, true)
			} catch (e) {
				console.log(e)
				product.i = i;
				try {
					await fs.promises.appendFile('errors.txt', JSON.stringify(product))
				} catch (e) {
					console.log(e)
				}
			}
		}

	} catch (e) {
		console.log("error numb 3", e)
	} finally {
		await client1.close()
	}
}

async function main2() {
	try {
		const browser = await puppeteer.launch({headless: true});
		const page = await browser.newPage();
		await client2.connect();
		for (let i = ms2; i <= me2; i++) {
			await page.goto(`${currentPage}/${i}`, {waitUntil: 'networkidle2'});
			const product = await scrapeProductPage(page)
			await updateDatabase(product, false)
			await sleep(33)
		}

	} catch (e) {
		console.log("error numb 4", e)
	} finally {
		await client2.close()
	}
}

main1()
