const puppeteer = require('puppeteer');
const $ = require('cheerio');
const url = 'https://students.sbschools.org/genesis/parents?gohome=true';

var email = '10013096@sbstudents.org';
var pass = '';
var url2 = encodeURI('https://students.sbschools.org/genesis/j_security_check?j_username='+email+'&j_password='+pass);

function func(){
    eval("header_goToTab('studentdata&tab2=gradebook','studentid=10013096');");
}


(async () => {
    const browser = await puppeteer.launch({
        headless: false, // launch headful mode
        slowMo: 250, // slow down puppeteer script so that it's easier to follow visually
      });
    const page = await browser.newPage();

    /*page.on('request', request => {
      if (request.resourceType() === 'image')
        request.abort();
      else
        request.continue();
  });*/

    await page.goto(url, {waitUntil: 'networkidle2'});
    await page.goto(url2, {waitUntil: 'networkidle2'});
    await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
	await page.waitForNavigation({ waitUntil: 'networkidle2' })

    const markingPeriods = await page.evaluate( () => (Array.from( (document.querySelectorAll( '[name="fldMarkingPeriod"]')[0]).childNodes, element => element.value ) ));

    console.log( "0:" + markingPeriods );
    var grades = {}
    for(var period of markingPeriods){
      if(period!=null){
        console.log(period);
        navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);
        await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
        await navresponse
        
        navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);
        const currentMarking = await page.evaluate( () => ((document.querySelectorAll( '[name="fldMarkingPeriod"]')[0]).value));
        
        if(currentMarking!=period){
          console.log("diff"+currentMarking+":"+period)
          await page.evaluate((markingPeriod) => switchMarkingPeriod(markingPeriod),period);
          console.log("switch")
          await navresponse
          
        }

        const html = await page.content();
      
        await page.screenshot({path: period+'examples.png'});
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
        for(var classs in grades){
          console.log(grades[classs]["title"]); 
          navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);
          console.log(navresponse)
          page.click("span[title='"+grades[classs]["title"]+"']");
          console.log("clicked")
          await navresponse;
          console.log("response")
          await page.screenshot({path: classs+'examples.png'});
          console.log("Going to grade book");
          navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);
          await page.evaluate(text => [...document.querySelectorAll('*')].find(e => e.textContent.trim() === text).click(), "Gradebook");
          await navresponse;
          //await page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);//page.waitForNavigation({ waitUntil: 'networkidle2' })
          console.log("Slecting marking");
          navresponse = page.waitForNavigation(['networkidle0', 'load', 'domcontentloaded']);
          await page.evaluate((markingPeriod) => switchMarkingPeriod(markingPeriod),period);
          //await page.waitForNavigation({ waitUntil: 'networkidle2' })
          await navresponse;
          console.log(navresponse)
          
        }
        
      }
    }

    console.log(grades);



    await browser.close();

  })();


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
