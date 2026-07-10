"use strict";

(function($, window, document) {
  
  function debounce(fn, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function normalizeForSearch(str) {
    if (!str || typeof str !== "string") return "";
    return str.toLowerCase()
      .normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function filterGameMatches(text, filter) {
    if (!filter) return true;
    const normalized = normalizeForSearch(text);
    const terms = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return terms.every(term => {
      const termNorm = normalizeForSearch(term);
      return normalized.includes(termNorm) || normalized.includes(term.toLowerCase());
    });
  }

  $(function() {
      
  const filterGames = function(){
    const self = $("#search-bar input[type=search]");
    const filter = self.val().replace(/<\/?[^>]+>/gi, '').trim();
    const gamelist = $("#game-list ul");
    const li = gamelist.children("li");
    
    li.each( (index,elem) => {
      const _this = $(elem);
      const gameName = _this.find(".game-box .info .title").text();
      const gameID = String(_this.find(".game-box").data("appid") || "");
      const source = _this.find(".game-box .info .source").text().trim().toLowerCase();
      const percentText = _this.find(".game-box .progressBar").attr("data-percent") || "";
      const countText = _this.find(".game-box .achievement-count").text().trim();
      
      let show = false;
      if (!filter) {
        show = true;
      } else if (/^\d+$/.test(filter)) {
        show = gameID === filter;
      } else {
        const terms = filter.toLowerCase().split(/\s+/).filter(Boolean);
        const matchName = filterGameMatches(gameName, filter);
        const matchSource = source && terms.some(t => source.includes(t));
        const matchProgress = terms.some(term => {
          if (term === "100%" || term === "100" || term === "completado" || term === "perfecto") return percentText === "100";
          if (term === "0%" || term === "0") return percentText === "0";
          if (/^\d+%?$/.test(term)) return percentText === term.replace("%","") || countText.includes(term);
          return false;
        });
        show = matchName || matchSource || matchProgress;
      }
      _this.toggle(show);
    });
  };

  $("#search-bar input[type=search]").on("input keyup", debounce(filterGames, 150));
      
  const filterAchievements = function(){
    const self = $("#search-bar-float input[type=search]");
    const searchValue = self.val().toString().toLowerCase().trim();
    const achievementlist = $("#achievement .achievement-list ul");
    const li = achievementlist.children("li:not(#hidden-disclaimer)"); 
    
    const hidden = $("#lock li#hidden-disclaimer").is(":visible");
    if (hidden && searchValue.length > 0) {
      $("#lock ul li.hidden").insertAfter("#hidden-disclaimer");
      $("#hidden-disclaimer").hide();
    }

    const terms = searchValue.split(/\s+/).filter(Boolean);

    li.each( (index,elem) => {  
      const _this = $(elem);
      if ( _this.find('> div.notice').length > 0 ) return;
      
      const achievementName = _this.find(".achievement .content .title").text().toString().toLowerCase();
      const achievementDesc = _this.find(".achievement .content .description").text().toString().toLowerCase();
      const achievementID = _this.find(".achievement").data("name").toString().toLowerCase();   
      
      let show = true;
      if (terms.length > 0 && !(_this.hasClass("hidden") && hidden)) {
        show = terms.every(term => 
          achievementName.includes(term) || achievementDesc.includes(term) || achievementID.includes(term)
        );
      }
      _this.toggle(show);
    });
  };

  $("#search-bar-float input[type=search]").on("input keyup", debounce(filterAchievements, 150));
  
  $("#search-bar input[type=search], #search-bar-float input[type=search]").change(function(){
		const self = $(this);
		if (self.val().length > 0) self.addClass("has");
		else self.removeClass("has"); 
  });

  $(document).keydown(function(e) {
    if(e.ctrlKey && e.which === 70) { //CTRL+F
      if($("#achievement").is(":visible")) {
        const elem = $("#search-bar-float input[type=search]");
        elem.is(":focus") ? elem.blur() : elem.focus();
      } else {
        const elem = $("#search-bar input[type=search]");
        elem.is(":focus") ? elem.blur() : elem.focus();
      }
    }
  });

  });
}(window.jQuery, window, document)); 