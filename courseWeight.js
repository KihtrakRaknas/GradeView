const puppeteer = require('puppeteer');
const fs = require('fs')
const url = 'https://sbhs.sbschools.org/school_information/student/course_listings___scheduling/2020_-_2021_course_listings';
const { createBrowser, createPage } = require('./GradeViewGetCurrentGrades/getCurrentGrades');
getCourseWeight(url)


async function scrapeCourseData(page){
  var obj = await page.evaluate(() => {
    var classesWithWeighting = [];
    for(table of document.getElementsByTagName("tr")){
      if(table.childNodes.length == 9&&table.childNodes[7].innerText.trim().includes("Weighting")){
        for(info of table.childNodes[7].innerText.trim().split("\n")){
          if(info.includes("Weighting")){
            classesWithWeighting.push({Name: table.childNodes[3].innerText.trim(),Weight:info.trim()});
          } 
        }
      }else if(table.childNodes.length == 9){
        if(table.childNodes[3].innerText.trim().includes("Advanced Placement"))
          classesWithWeighting.push({Name: table.childNodes[3].innerText.trim(),Weight:"A.P. Weighting"});
        if(table.childNodes[3].innerText.trim().includes("Honors"))
          classesWithWeighting.push({Name: table.childNodes[3].innerText.trim(),Weight:"Honors Weighting"});
        else if(table.childNodes[3].innerText.trim())
          classesWithWeighting.push({Name: table.childNodes[3].innerText.trim(),Weight:"N/A"});
      }
    }
    return classesWithWeighting;
  });
  console.log(obj)
  return obj;
}


async function getCourseWeight(url) {
    const browser = await createBrowser({
        //headless: false, // launch headful mode
        //slowMo: 1000, // slow down puppeteer script so that it's easier to follow visually
    })
    const page = await createPage(browser);

    await page.goto(url, {waitUntil: 'networkidle2'});

    var obj = await scrapeCourseData(page);

    //SPECIAL CASES
    
    obj.push({Name:"Honors Chemistry I",Weight:"Honors Weighting"})
    obj.push({Name:"AP English III-Lang/Comp",Weight:"A.P. Weighting"})
    obj.push({Name:"CS Topics: Mobile App Development",Weight:"A.P. Weighting"})

    obj.push({Name:"Natural Science & Engineer",Weight:"Honors Weighting"}) 
    obj.push({Name:"P.E. Wellness 9",Weight:"N/A"}) 
    obj.push({Name:"Grade 9 History",Weight:"N/A"}) 
    obj.push({Name:"Concert Band",Weight:"N/A"}) 
    obj.push({Name:"Health Wellness",Weight:"N/A"}) 

    //Other school cases


    obj.push({Name:"Principles of Biomedical Science",Weight:"A.P. Weighting"}) 
    obj.push({Name:"Medical Interventions",Weight:"A.P. Weighting"}) 


    try {
      fs.writeFileSync('classWeightingOutput.json', JSON.stringify(obj))
      console.log("File added to classWeightingOutput.json!")
    } catch (err) {
      console.error(err)
    }
    console.log("DONE")
  }
