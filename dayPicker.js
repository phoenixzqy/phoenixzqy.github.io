var dayPicker = (function(){
  /*
    Global Variables
  */
  // constant variables
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu","Fir", "Sat"];
  const MONTHS = ["January", "February", "March", "April", "May","Jun", "July", "Auguest", "September", "October", "November", "Decamber"];
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May","Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // datatype must be Date
  var firstSelectedDate;
  var secondSelectedDate;
  var picking;
  var gYear, gMonth;
  var options = {
    data: {},
    submit: function(){},
    first_input_box: "Check-in",
    second_input_box: "Check-out",
    submit_btn: "Search"
  }


  /*
    Helper functions
  */
  // date of today
  var currentDate = function(){
    return new Date().getDate();
  }
  // current year
  var currentYear = function(){
    return new Date().getFullYear();
  }
  // current month
  var currentMonth = function(){
    return new Date().getMonth();
  }
  // first week day of the given month
  // Note: month starts from 0 to 11
  var getFirstDay = function (month, year){
    if(!year)
      year = currentYear();
    if(!month)
      month = currentMonth();
    return new Date(year, month, 1).getDay();
  }
  // first date of the given month
  // Note: month starts from 0 to 11
  var getLastDay = function (month, year){
    if(!year)
      year = currentYear();
    if(!month)
      month = currentMonth();
    return new Date(year, month, 1).getDay();
  }
  // return number of days in given months
  var daysInMonth = function (month,year) {
    if(!year)
      year = currentYear();
    if(!month)
      month = currentMonth();
    return new Date(year, month + 1, 0).getDate();
  }
  // Date output formater
  var dateToString = function(d){
    return MONTHS_SHORT[d.getMonth()] + " " + d.getDate() + " " + d.getFullYear();
  }
  // compare Date of 2 Date: return an interger value
  // 1: >
  // 0: ==
  // -1: <
  var compareDate = function(d1, d2){
    d1.setHours(0,0,0,0);
    d2.setHours(0,0,0,0);
    if(d1 > d2)
      return 1;
    if(d1.getTime() === d2.getTime())
      return 0;
    if(d1 < d2)
      return -1;
  }

  /*
    dayPicker core functions
  */
  var reset = function(){
    firstSelectedDate = undefined;
    secondSelectedDate = undefined;
    picking = undefined;
    gYear = new Date().getFullYear();
    gMonth = new Date().getMonth();
    $("#dayPickerFirstDate").val(options.first_input_box)
    $("#dayPickerSecondDate").val(options.second_input_box);
    // create calendar tables
    createTable(gMonth, gYear, "#dayPickerLeftCalendar", ".dayPickerLeftMonthTitle");
    createTable(gMonth + 1, gYear, "#dayPickerRightCalendar", ".dayPickerRightMonthTitle");
    $("#dayPickerFirstDate").focus();
  }
  // generate table with given month and year
  var createTable = function(month, year, table, title){
    if(!year)
      year = currentYear();
    if(!month)
      month = currentMonth();
    // remove current old table
    $(table).empty();
    var d = new Date(year, month);
    // Month title
    $(title).html(MONTHS[d.getMonth()] + " " + d.getFullYear());

    var firstDay = getFirstDay(month, year);
    var totalDays = daysInMonth(month, year);
    var counter = totalDays - 1;
    var today = currentDate();
    var thisYear = currentYear();
    var thisMonth = currentMonth();

    // generate table
    for(var i = 0; i < 6; i++){
      var row = "";
      for(var j = 0; j < 7; j++){
        if((i == 0 && j < firstDay) || counter < 0)
          row += "<td></td>";
        else{
          // point out today
          if(thisYear == year && thisMonth == month && today == (totalDays - counter))
            row += "<td year=" + year + " month=" + month + " class='dayPickerToday'>" + (totalDays - counter) + "</td>";
          else
            row += "<td year=" + year + " month=" + month + " >" + (totalDays - counter) + "</td>";
          counter--;
        }
      }
      $(table).append("<tr> " + row + "</tr>");
      row = "";
    }
    pickedDateEffect();
    // Date Click event: pick a date
    $("#dayPicker td").unbind('click').bind('click',function(){
      pickDate(this);
    });
    // blur all dates before today
    blurDaysBefore();
    // initialism hover effect
    $("#dayPicker td").mouseenter(function(){
      var month = $(this).attr("month");
      var year = $(this).attr("year");
      var date = $(this).html();
      linkDaysHover(date, month, year);
    }).mouseleave(function(){
      $("#dayPicker td").each(function(){
        $(this).removeClass("dayPickerLinkDays");
      })
    });
  }
  // day picker hover effect, link today to hover date
  var linkDaysHover = function(date, month, year){
    if(!date || date == "")
      return;
    if((!firstSelectedDate && !secondSelectedDate) || (firstSelectedDate && secondSelectedDate))
      return;
    var hoverAnchorDate = new Date(year, month, date);
    var startAnchorDate;
    if(picking == 2 && firstSelectedDate)
      startAnchorDate = firstSelectedDate;
    else if(picking == 1 && secondSelectedDate)
      startAnchorDate = secondSelectedDate;


    hoverAnchorDate.setHours(0,0,0,0);
    startAnchorDate.setHours(0,0,0,0);
    $("#dayPicker td").each(function(){
      if($(this).html() != ""){
        var d = new Date($(this).attr("year"), $(this).attr("month"), $(this).html());
        if((hoverAnchorDate < d && d < startAnchorDate) || (startAnchorDate < d && d < hoverAnchorDate))
          $(this).addClass("dayPickerDaysBetweenPicked");
        else
          $(this).removeClass("dayPickerDaysBetweenPicked");
      }
    });
  }
  // blur all dates before today
  var blurDaysBefore = function(){
    var today = new Date();
    today.setHours(0,0,0,0);
    $("#dayPicker td").each(function(){
      var d = new Date($(this).attr("year"), $(this).attr("month"), $(this).html());
      d.setHours(0,0,0,0);
      if(d < today){
        $(this).css("color", "#ccc");
        $(this).css("text-decoration", "line-through");
      }
    })
  }
  var pickedDateEffect = function(){
    // add css effect to picked date and days between picked days
    $("#dayPicker td").each(function(){
      if($(this).html() != ''){
        var d = new Date($(this).attr("year"), $(this).attr("month"), $(this).html());
        if((firstSelectedDate && compareDate(d, firstSelectedDate) == 0 )|| (secondSelectedDate && compareDate(d, secondSelectedDate) == 0))
          $(this).addClass("dayPickerPicked");
        else
          $(this).removeClass("dayPickerPicked");
        // add effect between 2 selected date
        $(this).removeClass("dayPickerDaysBetweenPicked");
        if((firstSelectedDate && secondSelectedDate) && (firstSelectedDate < d && d < secondSelectedDate)){
          $(this).addClass("dayPickerDaysBetweenPicked");
        }
      }
    })
  }
  // pick a date by user click on date
  var pickDate = function(e){
    if(!$(e).attr("year"))
      return;
    var pickedDate = new Date($(e).attr("year"), $(e).attr("month"), $(e).html());
    var today = new Date();
    today.setHours(0,0,0,0);
    pickedDate.setHours(0,0,0,0);
    if(picking == 2){
      if(pickedDate >= today){
        if(!firstSelectedDate){
          $("#dayPickerFirstDate").focus();
        }else if(pickedDate < firstSelectedDate){
          secondSelectedDate = undefined;
          firstSelectedDate = pickedDate;
          $("#dayPickerSecondDate").val(options.second_input_box);
          $("#dayPickerFirstDate").focus();
        }else{
          secondSelectedDate = pickedDate;
          secondSelectedDate.setHours(0,0,0,0);
          $("#dayPickerSecondDate").val(dateToString(secondSelectedDate));
          // close calendar window after selection
          $(".dayPickerDualPanel").css("display", "none");
        }
      }
    }
    if(picking == 1){
      if(pickedDate >= today){
        firstSelectedDate = pickedDate;
        firstSelectedDate.setHours(0,0,0,0);
        $("#dayPickerFirstDate").val(dateToString(firstSelectedDate));
        // if first selected date is newer than second selected date, reset second date
        if(secondSelectedDate && firstSelectedDate > secondSelectedDate){
          secondSelectedDate = undefined;
          $("#dayPickerSecondDate").val(options.second_input_box);
        }
        $("#dayPickerSecondDate").focus();
      }

    }
    pickedDateEffect();
  }
  // change the current displayed calendar by given number, +1 means month +1, -1 means month -1
  var changeCalendar = function(x){
    gMonth += x;
    // create calendar tables
    createTable(gMonth, gYear, "#dayPickerLeftCalendar", ".dayPickerLeftMonthTitle");
    createTable(gMonth + 1, gYear, "#dayPickerRightCalendar", ".dayPickerRightMonthTitle");
  }
  // add dayPicker frame into DOM
  var addFrame = function(){
    $("#dayPicker").append('\
          <form id="dayPickerForm">\
            <input id="dayPickerFirstDate" type="text" value="' + options.first_input_box + '"/>\
            <input id="dayPickerSecondDate" type="text" value="' + options.second_input_box + '"/>\
          </form>\
          <div id="dayPickerReset"><svg viewBox="0 0 12 12" data-reactid=".3.0.0.0.1.0.0.0.3.1"><path d="M11.53.47a.75.75 0 0 0-1.061 0l-4.47 4.47L1.529.47A.75.75 0 1 0 .468 1.531l4.47 4.47-4.47 4.47a.75.75 0 1 0 1.061 1.061l4.47-4.47 4.47 4.47a.75.75 0 1 0 1.061-1.061l-4.47-4.47 4.47-4.47a.75.75 0 0 0 0-1.061z" data-reactid=".3.0.0.0.1.0.0.0.3.1.0"></path></svg></div>\
          <button id="dayPickerSubmit">' + options.submit_btn + '</button>\
          <div class="dayPickerDualPanel">\
            <span id="dayPickerPrevBtn">&lt;</span>\
            <span id="dayPickerNextBtn">&gt;</span>\
            <div class="dayPickerSinglePanel">\
              <h2 class="dayPickerLeftMonthTitle"></h2>\
              <ul class="dayPickerLeftWeekDays"></ul>\
              <table id="dayPickerLeftCalendar">\
              </table>\
            </div>\
            <div class="dayPickerSinglePanel">\
              <h2 class="dayPickerRightMonthTitle"></h2>\
              <ul class="dayPickerRightWeekDays"></ul>\
              <table id="dayPickerRightCalendar">\
              </table>\
            </div>\
          </div>');
  }

  /*
    Driver
  */
  // generate day picker frame
var  createCalendar =  function(month, year){
    if(!year)
      year = currentYear();
    if(!month)
      month = currentMonth();
    gYear = year;
    gMonth = month;
    // add tables to DOM
    addFrame();
    // WEEKDAYS list
    for(var i in WEEKDAYS){
      $(".dayPickerLeftWeekDays").append("<li>" + WEEKDAYS[i] + "</li>");
      $(".dayPickerRightWeekDays").append("<li>" + WEEKDAYS[i] + "</li>");
    }
    // create calendar tables
    createTable(gMonth, gYear, "#dayPickerLeftCalendar", ".dayPickerLeftMonthTitle");
    createTable(gMonth + 1, gYear, "#dayPickerRightCalendar", ".dayPickerRightMonthTitle");


    // prev and next buttons
    $("#dayPickerPrevBtn").click(function(){
      changeCalendar(-1);
    });
    $("#dayPickerNextBtn").click(function(){
      changeCalendar(1);
    });
    // reset btn
    $("#dayPickerReset").click(function(){
      reset();
    })
    // input boxes
    $("#dayPickerFirstDate").focus(function(){
      picking = 1;
      $(".dayPickerDualPanel").css("display", "block");
    })
    $("#dayPickerSecondDate").focus(function(){
      picking = 2;
      $(".dayPickerDualPanel").css("display", "block");
    })
    // hide the dayPicker window when click out of #dayPicker element
    $(window).click(function() {
      $(".dayPickerDualPanel").css("display", "none");
    });
    $('#dayPicker').click(function(event){
        event.stopPropagation();
    });
    // submit button
    $("#dayPickerSubmit").click(function(){
      options.submit();
    })
  }

    return {
      init : function(op){

        if(op.first_input_box)
          options.first_input_box = op.first_input_box;
        if(op.second_input_box)
          options.second_input_box = op.second_input_box;
        if(op.submit_btn)
          options.submit_btn = op.submit_btn;
        createCalendar();
      },
      getDates : function(){
        var dates = {
          firstDate: $("#dayPickerFirstDate").val(),
          secondDate: $("#dayPickerSecondDate").val()
        }
        return dates;
      },
      submit : function(cb){
        options.submit = cb;
      }
    }

})();
