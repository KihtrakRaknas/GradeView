const puppeteer = require('puppeteer');
const $ = require('cheerio');
const express = require('express')
const bodyParser = require('body-parser');

const app = express()
const port = process.env.PORT || 3000
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.post('/', async (req, res) => {
	const username = req.body.username;//'10012734'
	const password = req.body.password; //'Sled%2#9'
	console.log(username	);
	console.log(req.body);
	var dataObj = await getData(username,password)
	res.send(dataObj)
	})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))

const url = 'https://students.sbschools.org/genesis/parents?gohome=true';

//var id = '10012734'


function func(){
    eval("header_goToTab('studentdata&tab2=gradebook','studentid="+id+"');");
}


async function getData(id, pass) {
	var email = encodeURIComponent(id+'@sbstudents.org');
	pass = encodeURIComponent(pass);
var url2 = 'https://students.sbschools.org/genesis/j_security_check?j_username='+email+'&j_password='+pass;

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
      /*
        headless: false, // launch headful mode
        slowMo: 250, // slow down puppeteer script so that it's easier to follow visually
      */});
    const page = await browser.newPage();

    /*await page.setViewport({
	    width: 1920,
	    height: 1080
	})*/

    await page.setRequestInterception(true);

    page.on('request', (req) => {
        if(req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() === 'image' || req.resourceType() === 'media'){
            req.abort();
        }
        else {
            req.continue();
        }
	});

    await page.goto(url, {waitUntil: 'networkidle2'});
    await page.goto(url2, {waitUntil: 'networkidle2'});
    await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
	await page.waitForNavigation({ waitUntil: 'networkidle2' })

    const markingPeriods = await page.evaluate( () => (Array.from( (document.querySelectorAll( '[name="fldMarkingPeriod"]')[0]).childNodes, element => element.value ) ));

    console.log( "0:" + markingPeriods );
    var htmlOld = await page.content();
    var grades = {}
    var isCurrentMarking = false;
    for(var period of markingPeriods){
      if(period!=null){
        console.log(period);
        navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);
        await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
        await navresponse
        console.log("navigated to gradebook")

        navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);
        const currentMarking = await page.evaluate( () => ((document.querySelectorAll( '[name="fldMarkingPeriod"]')[0]).value));
		console.log("diff"+currentMarking+":"+period)
		var htmlTemp;
        if(currentMarking!=period){
			console.log("switchSTART")
          await page.evaluate((markingPeriod) => switchMarkingPeriod(markingPeriod),period);
          console.log("switch")
          await navresponse
          	var htmlTemp = await page.content();
        	console.log("HTML1");
          isCurrentMarking = false;
        }else{
			htmlTemp = htmlOld;
      console.log("tempDone");
      isCurrentMarking = true;
		}

    const html = htmlTemp;
		console.log(html);

        //await page.screenshot({path: period+'examples.png'});
        var title
        await $('.list', html).find("tbody").find(".categorytab").each(function() {
          const className = $(this).text().trim();
            console.log("OUT: "+className);
            if(!grades[className])
              grades[className] = {}
            var teacherName = $(this).parent().parent().find(".cellLeft").eq(1).text().trim();
            teacherName=teacherName.substring(0,teacherName.indexOf("\n"));
            console.log(teacherName);
            if(!grades[className]["teacher"])
              grades[className]["teacher"]=teacherName;


              //var avg = $(this).parent().parent().find($("td[title='View Course Summary']")).textContent;
              var avg = $(this).parent().parent().find(".cellRight").eq(0).text().trim();
              avg=avg.substring(0,avg.indexOf("\n"));
              console.log(avg);
            if(!grades[className][period])
              grades[className][period]={}
            grades[className][period]["avg"]=avg;
            grades[className]["title"]= $(this).prop('title');


        });
        console.log("done");
        if(!isCurrentMarking)
          var html2 = await page.content();
        console.log(grades);
        for(var classs in grades){
          console.log(grades[classs]["title"]);
          console.log(navresponse)

          navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);

          try{
              await page.evaluate((text) => document.querySelector("span[title='"+text+"']").click(),grades[classs]["title"]);
                    //var res = page.click("span[title='"+grades[classs]["title"]+"']");
          }catch(e){
            console.log(e)
          }

          console.log("res")
          //await res;
          await navresponse;
          console.log("response")

          var list = await page.evaluate(() => {
            var assignments = [];
            for(var node of document.getElementsByClassName("list")[0].childNodes[1].childNodes){

              if(node.classList && !node.classList.contains("listheading")&&node.childNodes.length>=11){
                var assignData={};

                //console.log(node.childNodes);
                console.log(node.childNodes[3].innerText);
                  assignData["Date"] = node.childNodes[3].innerText;
                console.log(node.childNodes[7].innerText);
                assignData["Category"] = node.childNodes[7].innerText
                console.log(node.childNodes[9].innerText);
                assignData["Name"] = node.childNodes[9].innerText;
                console.log(node.childNodes[11].childNodes[0].textContent.replace(/\s/g,''));
                assignData["Grade"] = node.childNodes[11].childNodes[0].textContent.replace(/\s/g,'')
                assignments.push(assignData);
                }
            }
            return assignments;
          });
          grades[classs][period]["Assignments"] = list;
          console.log(grades[classs][period]["Assignments"]);


          //await page.screenshot({path: classs+'examples.png'});
          console.log("Going to grade book");
          navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);
          await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
          await navresponse;
          //await page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);//page.waitForNavigation({ waitUntil: 'networkidle2' })
          if(!isCurrentMarking){
            console.log("Slecting marking");

            navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);

            await page.evaluate((markingPeriod) => switchMarkingPeriod(markingPeriod),period);
            //await page.waitForNavigation({ waitUntil: 'networkidle2' })
            await navresponse;
            //console.log(navresponse)
            //await page.screenshot({path: 'examples.png'});
          }

        }
        htmlOld = html2;

      }
    }

    console.log(grades);



    await browser.close();

    return grades;

  }


/*puppeteer
  .launch()
  .then(function(browser){
    return browser.newPage();
  })
  .then(function(page) {
    return page.goto().then(function() {
        return page.goto(url2).then(function() {
            //page.find(".headerCategoryTabSelected").click();
            page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook")
            //console.log(page.content())
            page.waitForNavigation({ waitUntil: 'networkidle0' })

            return page.content();
        });
    });
  })
  .then(function(html) {
    //console.log(html);
    page.screenshot({path: 'examples.png'});

  })
  .catch(function(err) {
    //handle error
  });*/
