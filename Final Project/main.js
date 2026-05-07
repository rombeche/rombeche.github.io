const margin = { top: 36, right: 36, bottom: 78, left: 100 };
const outerWidth = 1280;
const width = outerWidth - margin.left - margin.right;
const height = 720;
const contextStripHeight = 58;
const contextTop = height + 52 + 12;
const chartBottom = contextTop + contextStripHeight + 18;
const outerHeight = margin.top + chartBottom + margin.bottom;

const container = d3.select("#timeline");

container
  .insert("div", ":first-child")
  .attr("class", "timeline-toolbar")
  .html(
    '<span class="timeline-toolbar-hint">Drag the shaded band below the chart to choose a year range. Thumbnails grow when fewer paintings are visible.</span>' +
      '<div class="timeline-toolbar-actions">' +
      '<button type="button" class="timeline-reset" id="timeline-reset-range" title="Click to return to the full timeline.">Reset year range</button>' +
      '<button type="button" class="timeline-reset" id="timeline-initial-window" title="Click and drag to see a focused view of the timeline by year.">Slider</button>' +
      "</div>"
  );

const svg = container
  .append("svg")
  .attr("viewBox", `0 0 ${outerWidth} ${outerHeight}`)
  .attr("width", "100%")
  .attr("height", "100%")
  .attr("role", "img")
  .attr("aria-label", "Timeline of Edvard Munch paintings by year");

// ── ARIA live region for filter/count announcements (Task 1 & Task 2) ──
const srAnnounce = document.createElement("div");
srAnnounce.id = "sr-announce";
srAnnounce.setAttribute("role", "status");
srAnnounce.setAttribute("aria-live", "polite");
srAnnounce.setAttribute("aria-atomic", "true");
srAnnounce.className = "sr-only";
document.body.appendChild(srAnnounce);

function announce(msg) {
  srAnnounce.textContent = "";
  // Small delay so screen readers reliably pick up the change
  setTimeout(() => { srAnnounce.textContent = msg; }, 50);
}

const chart = svg
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const popup = document.getElementById("painting-popup");
const popupCloseButton = document.getElementById("popup-close");
const popupTitle = document.getElementById("popup-title");
const popupYear = document.getElementById("popup-year");
const popupSize = document.getElementById("popup-size");
const popupLocation = document.getElementById("popup-location");
const popupTechnique = document.getElementById("popup-technique");
const popupStatus = document.getElementById("popup-status");
const popupPicture = document.getElementById("popup-picture");
const popupImageAvif = document.getElementById("popup-image-avif");
const popupImageWebp = document.getElementById("popup-image-webp");
const popupImage = document.getElementById("popup-image");
const popupImageNote = document.getElementById("popup-image-note");
const filtersContainer = document.getElementById("timeline-filters");

function parseSizeToArea(sizeText) {
  if (!sizeText) return NaN;
  const normalized = String(sizeText).replaceAll(",", ".").replaceAll("×", "x");
  const matches = normalized.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) return NaN;
  const first = Number.parseFloat(matches[0]);
  const second = Number.parseFloat(matches[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return NaN;
  return first * second;
}

function parseYear(yearText) {
  if (!yearText) return NaN;
  const match = String(yearText).match(/\d{4}/);
  if (!match) return NaN;
  return Number.parseInt(match[0], 10);
}

function normalizeValue(value, fallback = "Unknown") {
  const text = String(value || "").trim();
  return text || fallback;
}

function buildSizeLabel(area, q33, q66) {
  if (!Number.isFinite(area)) return "Unknown";
  if (area <= q33) return "Small";
  if (area <= q66) return "Medium";
  return "Large";
}

function buildFilterGroup(id, label, options) {
  const wrapper = document.createElement("div");
  wrapper.className = "filter-group";

  const fieldLabel = document.createElement("label");
  fieldLabel.setAttribute("for", id);
  fieldLabel.textContent = label;

  const select = document.createElement("select");
  select.id = id;
  // Announce filter name when focused so keyboard users know where they are
  select.setAttribute("aria-label", label);
  options.forEach((optionText) => {
    const option = document.createElement("option");
    option.value = optionText;
    option.textContent = optionText;
    select.appendChild(option);
  });

  wrapper.append(fieldLabel, select);
  return { wrapper, select };
}

function searchTokens(query) {
  return String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function paintingMatchesSearch(d, appliedQuery) {
  const tokens = searchTokens(appliedQuery);
  if (!tokens.length) return true;
  const hay = [d.title, d.yearText, d.location, d.technique, d.size]
    .filter(Boolean).join(" ").toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

function buildPopupImageSources(imageSrc) {
  if (!imageSrc) return { avif: "", webp: "", fallback: "" };
  const extPattern = /\.(jpe?g|png|gif|bmp|tiff?|webp|avif)$/i;
  const hasKnownExtension = extPattern.test(imageSrc);
  const base = hasKnownExtension ? imageSrc.replace(extPattern, "") : imageSrc;
  return { avif: `${base}.avif`, webp: `${base}.webp`, fallback: imageSrc };
}

function showPopup(d) {
  popupTitle.textContent = d.title || "Untitled";
  popupImage.alt = `Painting preview: ${d.title || "Untitled"}`;
  popupYear.textContent = `Year: ${d.yearText || "Unknown"}`;
  popupSize.textContent = `Size: ${d.size || "Unknown"}`;
  popupLocation.textContent = `Location: ${d.location || "Unknown"}`;
  popupTechnique.textContent = `Technique: ${d.technique || "Unknown"}`;
  popupStatus.textContent = `Status: ${d.status || "Known"}`;

  if (d.originalSrc) {
    const imageSources = buildPopupImageSources(d.originalSrc);
    popupPicture.classList.remove("hidden");
    popupImageNote.classList.add("hidden");
    popupImage.dataset.fallbackSrc = imageSources.fallback;
    popupImage.dataset.retriedFallback = "false";
    popupImageAvif.srcset = imageSources.avif;
    popupImageWebp.srcset = imageSources.webp;
    popupImage.src = imageSources.fallback;
  } else {
    popupPicture.classList.add("hidden");
    popupImageAvif.removeAttribute("srcset");
    popupImageWebp.removeAttribute("srcset");
    popupImage.removeAttribute("src");
    popupImageNote.classList.remove("hidden");
  }

  popup.classList.remove("hidden");
  // Move focus into the popup so keyboard/screen-reader users land there (Task 3)
  popupCloseButton.focus();
}

popupCloseButton.addEventListener("click", () => {
  popup.classList.add("hidden");
  // Return focus to the last-activated thumbnail (Task 3)
  if (lastActivatedThumb) lastActivatedThumb.focus();
});

popupImage.addEventListener("error", () => {
  const fallbackSrc = popupImage.dataset.fallbackSrc || "";
  const alreadyRetried = popupImage.dataset.retriedFallback === "true";
  if (!alreadyRetried && fallbackSrc) {
    popupImage.dataset.retriedFallback = "true";
    popupImageAvif.removeAttribute("srcset");
    popupImageWebp.removeAttribute("srcset");
    popupImage.src = fallbackSrc;
    return;
  }
  popupPicture.classList.add("hidden");
  popupImageNote.classList.remove("hidden");
});

function resolveThumbnailSource(d) {
  const direct = d.image || d.image_url || d.url || "";
  if (direct) return direct;
  if (!d.filename) return "";
  return `munch_paintings_thumbnails/${d.filename}`;
}
function resolveOriginalSource(d) {
  if (!d.filename) return "";
  return `munch_paintings/${d.filename}`;
}

function thumbSizeForCount(n) {
  if (n <= 0) return 14;
  if (n <= 40) return 52;
  if (n <= 100) return 40;
  if (n <= 220) return 28;
  if (n <= 450) return 20;
  if (n <= 900) return 14;
  return 9;
}

// Tracks the last thumbnail button focused so we can return focus on popup close (Task 3)
let lastActivatedThumb = null;

d3.csv("edvard_munch.csv", (d) => ({
  title: d.title || d.name,
  number: d.number ? +d.number : null,
  yearText: d.year || "",
  year: parseYear(d.year),
  location: normalizeValue(d.location),
  status: normalizeValue(d.status),
  technique: normalizeValue(d.technique),
  size: normalizeValue(String(d.size || d.dimensions || "").replaceAll(",", ".")),
  area: parseSizeToArea(d.size || d.dimensions || ""),
  filename: d.filename || "",
  thumbnailSrc: resolveThumbnailSource(d),
  originalSrc: resolveOriginalSource(d)
}))
  .then((data) => {
    const finiteAreas = data.map((d) => d.area).filter(Number.isFinite).sort(d3.ascending);
    const q33 = d3.quantile(finiteAreas, 0.33) ?? 0;
    const q66 = d3.quantile(finiteAreas, 0.66) ?? 0;
    const allPaintings = [...data]
      .map((d) => ({ ...d, sizeLabel: buildSizeLabel(d.area, q33, q66) }))
      .sort((a, b) => d3.ascending(a.year, b.year));
    const years = allPaintings.map((d) => d.year).filter(Number.isFinite);
    const minYear = d3.min(years);
    const maxYear = d3.max(years);

    if (!Number.isFinite(minYear) || !Number.isFinite(maxYear)) {
      throw new Error("No parseable years found in CSV.");
    }

    function yearDate(y) { return new Date(y, 0, 1); }
    const yearTickFormat = d3.timeFormat("%Y");

    const xScaleContext = d3.scaleTime().range([0, width]);
    const xScaleFocus = d3.scaleTime().range([0, width]);
    const yScaleContext = d3.scaleLinear().range([contextStripHeight, 0]);

    const withFiniteYear = allPaintings.filter((d) => Number.isFinite(d.year));
    const countByYear = d3.rollup(withFiniteYear, (v) => v.length, (d) => d.year);
    const yearlySeries = Array.from(countByYear, ([y, cnt]) => ({
      date: yearDate(y),
      count: cnt
    })).sort((a, b) => d3.ascending(a.date, b.date));

    const dateExtent = d3.extent(yearlySeries, (d) => d.date);
    const maxYearlyCount = d3.max(yearlySeries, (d) => d.count) ?? 1;

    xScaleContext.domain(dateExtent).nice(d3.timeYear);
    yScaleContext.domain([0, maxYearlyCount]).nice();
    xScaleFocus.domain(xScaleContext.domain());

    const contextArea = d3.area()
      .x((d) => xScaleContext(d.date))
      .y1((d) => yScaleContext(d.count))
      .y0(contextStripHeight);

    const xAxisY = height / 2;
    const xAxisLabelY = height + 45;

    const timeGrid = chart.append("g").attr("class", "time-grid")
      .call(d3.axisBottom(xScaleFocus).tickSize(height).tickFormat(""))
      .attr("transform", "translate(0,0)");

    chart.append("g").attr("class", "timeline-line")
      .append("line")
      .attr("x1", 0).attr("x2", width)
      .attr("y1", xAxisY).attr("y2", xAxisY);

    const xAxisG = chart.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(xScaleFocus).ticks(d3.timeYear.every(10)).tickFormat(yearTickFormat));

    chart.append("text")
      .attr("x", width / 2).attr("y", xAxisLabelY)
      .attr("text-anchor", "middle").attr("fill", "#4b5563")
      .text("Year");

    const context = chart.append("g")
      .attr("class", "context")
      .attr("transform", `translate(0, ${contextTop})`);

    context.append("rect")
      .attr("class", "context-bg")
      .attr("width", width).attr("height", contextStripHeight).attr("rx", 4);

    context.append("path")
      .datum(yearlySeries)
      .attr("class", "chart-area")
      .attr("d", contextArea);

    context.append("g")
      .attr("class", "axis context-axis x-axis")
      .attr("transform", `translate(0, ${contextStripHeight})`)
      .call(
        d3.axisBottom(xScaleContext)
          .ticks(Math.min(10, Math.round(width / 85)))
          .tickFormat(yearTickFormat)
          .tickSizeOuter(0)
      );

    // ── Screen-reader table for keyboard-accessible painting list (Tasks 2 & 3) ──
    const srTable = document.createElement("table");
    srTable.id = "sr-paintings-table";
    srTable.className = "sr-only";
    srTable.setAttribute("aria-label", "Paintings list sorted by year");
    srTable.innerHTML = `<thead><tr>
      <th scope="col">Title</th>
      <th scope="col">Year</th>
      <th scope="col">Technique</th>
      <th scope="col">Size</th>
      <th scope="col">Location</th>
    </tr></thead><tbody id="sr-paintings-tbody"></tbody>`;
    document.querySelector(".chart-card").appendChild(srTable);
    const srTbody = document.getElementById("sr-paintings-tbody");

    const toggleTableBtn = document.getElementById("toggle-table");

    toggleTableBtn.addEventListener("click", () => {
      srTable.classList.toggle("sr-only");
      srTable.classList.toggle("data-table-visible");

    toggleTableBtn.textContent = srTable.classList.contains("sr-only")
      ? "View Data Table"
        : "Hide Data Table";
    });

    const appliedFilters = { size: "All", location: "All", technique: "All" };
    let appliedSearch = "";

    const searchGroup = document.createElement("div");
    searchGroup.className = "filter-group filter-search";
    const searchLabel = document.createElement("label");
    searchLabel.setAttribute("for", "filter-search");
    searchLabel.textContent = "Search titles / keywords";
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.id = "filter-search";
    searchInput.placeholder = "e.g. scream, portrait, 1890…";
    searchInput.setAttribute("autocomplete", "off");
    searchGroup.append(searchLabel, searchInput);
    filtersContainer.appendChild(searchGroup);

    function sortedUnique(values) {
      return [...new Set(values)].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      );
    }

    const sizeOptions = ["All", ...sortedUnique(allPaintings.map((d) => d.sizeLabel))];
    const locationOptions = ["All", ...sortedUnique(allPaintings.map((d) => d.location))];
    const techniqueOptions = ["All", ...sortedUnique(allPaintings.map((d) => d.technique))];
    const groups = [
      buildFilterGroup("filter-size", "Size", sizeOptions),
      buildFilterGroup("filter-location", "Location", locationOptions),
      buildFilterGroup("filter-technique", "Technique", techniqueOptions)
    ];

    groups.forEach((group) => filtersContainer.appendChild(group.wrapper));

    const filterActions = document.createElement("div");
    filterActions.className = "filter-actions";
    const applyFiltersButton = document.createElement("button");
    applyFiltersButton.type = "button";
    applyFiltersButton.className = "filter-btn filter-btn-primary";
    applyFiltersButton.id = "filter-apply";
    applyFiltersButton.textContent = "Apply";
    const resetFiltersButton = document.createElement("button");
    resetFiltersButton.type = "button";
    resetFiltersButton.className = "filter-btn";
    resetFiltersButton.id = "filter-reset";
    resetFiltersButton.textContent = "Reset";
    filterActions.append(applyFiltersButton, resetFiltersButton);
    filtersContainer.appendChild(filterActions);

    function applyFilters(paintings) {
      return paintings.filter((d) => {
        const sizeOk = appliedFilters.size === "All" || d.sizeLabel === appliedFilters.size;
        const locationOk = appliedFilters.location === "All" || d.location === appliedFilters.location;
        const techniqueOk = appliedFilters.technique === "All" || d.technique === appliedFilters.technique;
        const searchOk = paintingMatchesSearch(d, appliedSearch);
        return sizeOk && locationOk && techniqueOk && searchOk;
      });
    }

    function passesYearBrush(d) {
      const [t0, t1] = xScaleFocus.domain();
      const lo = t0 <= t1 ? t0 : t1;
      const hi = t0 <= t1 ? t1 : t0;
      if (Number.isFinite(d.year)) {
        const td = yearDate(d.year);
        return td >= lo && td <= hi;
      }
      const [c0, c1] = xScaleContext.domain();
      const cl = c0 <= c1 ? c0 : c1;
      const ch = c0 <= c1 ? c1 : c0;
      return lo <= cl && hi >= ch;
    }

    // ── Build the year-range summary string (Task 2) ──
    function buildYearRangeSummary(paintings) {
      const ys = paintings.map((d) => d.year).filter(Number.isFinite);
      if (!ys.length) return "No year data available.";
      const earliest = d3.min(ys);
      const latest = d3.max(ys);
      return earliest === latest
        ? `All paintings are from ${earliest}.`
        : `Paintings range from ${earliest} to ${latest} — a span of ${latest - earliest} years.`;
    }

    // ── Populate the SR table sorted by year (Tasks 2 & 3) ──
    function updateSrTable(paintings) {
      const sorted = [...paintings].sort((a, b) => d3.ascending(a.year, b.year));
      srTbody.innerHTML = "";
      sorted.forEach((d) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${d.title || "Untitled"}</td>
          <td>${d.yearText || "Unknown"}</td>
          <td>${d.technique || "Unknown"}</td>
          <td>${d.size || "Unknown"}</td>
          <td>${d.location || "Unknown"}</td>`;
        srTbody.appendChild(tr);
      });
    }

    function updateTimeline() {
      const filteredPaintings = applyFilters(allPaintings).filter(passesYearBrush);
      const count = filteredPaintings.length;

      // ── Build active-filter description for announcement (Task 1) ──
      const techLabel = appliedFilters.technique !== "All" ? appliedFilters.technique : null;
      const locLabel  = appliedFilters.location  !== "All" ? appliedFilters.location  : null;
      const sizeLabel = appliedFilters.size       !== "All" ? appliedFilters.size       : null;
      const searchLabel2 = appliedSearch ? `matching "${appliedSearch}"` : null;
      const filterParts = [techLabel, locLabel, sizeLabel, searchLabel2].filter(Boolean);
      const filterDesc = filterParts.length ? filterParts.join(", ") : "all techniques";

      // ── Year range summary (Task 2) ──
      const yearSummary = buildYearRangeSummary(filteredPaintings);

      // ── Announce count + year range to screen readers (Tasks 1 & 2) ──
      announce(`Showing ${count} painting${count !== 1 ? "s" : ""} for ${filterDesc}. ${yearSummary}`);

      // ── Update the hidden SR table (Tasks 2 & 3) ──
      updateSrTable(filteredPaintings);

      timeGrid.call(d3.axisBottom(xScaleFocus).tickSize(height).tickFormat(""));
      xAxisG.call(d3.axisBottom(xScaleFocus).ticks(d3.timeYear.every(10)).tickFormat(yearTickFormat));
      chart.select(".timeline-line line").attr("x2", width);

      const thumbSize = thumbSizeForCount(count);
      const laneStep = thumbSize + 2;
      const maxLanes = Math.max(1, Math.floor((height - 30) / laneStep));
      const lanes = Math.min(maxLanes, Math.max(1, count));

      const positionedPaintings = filteredPaintings.map((d, index) => {
        const laneIndex = index % lanes;
        const laneOffset = (laneIndex - (lanes - 1) / 2) * laneStep;
        const midFocus = (xScaleFocus.domain()[0].getTime() + xScaleFocus.domain()[1].getTime()) / 2;
        const dateForX = Number.isFinite(d.year) ? yearDate(d.year) : new Date(midFocus);
        return { ...d, plotX: xScaleFocus(dateForX), plotY: xAxisY + laneOffset };
      });

      // ── Render thumbnails as SVG <image> elements (original approach) ──
      // Keyboard accessibility is handled via tabindex and keydown on the SVG image.
      const thumbs = chart.selectAll(".painting-thumb")
        .data(
          positionedPaintings,
          (d) => `${d.number ?? "na"}-${d.title}-${d.yearText}-${d.location}`
        );

      thumbs.exit().remove();

      const thumbsEnter = thumbs.enter()
        .append("image")
        .attr("class", "painting-thumb")
        .attr("role", "button")
        .attr("tabindex", "0")
        .on("click", function (event, d) {
          d3.selectAll(".painting-thumb").classed("active", false);
          d3.select(this).classed("active", true);
          lastActivatedThumb = this;
          showPopup(d);
        })
        .on("keydown", function (event, d) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            d3.selectAll(".painting-thumb").classed("active", false);
            d3.select(this).classed("active", true);
            lastActivatedThumb = this;
            showPopup(d);
          }
        });

      thumbsEnter.merge(thumbs)
        .attr("href", (d) => d.thumbnailSrc || "")
        .attr("x", (d) => d.plotX - thumbSize / 2)
        .attr("y", (d) => d.plotY - thumbSize / 2)
        .attr("width", thumbSize)
        .attr("height", thumbSize)
        .attr("aria-label", (d) =>
          `${d.title || "Untitled"}, ${d.yearText || "unknown year"}, ${d.technique || "unknown technique"}`);
    }

    const brushG = context.append("g").attr("class", "brush x-brush");

    function brushed(selection) {
      if (selection) {
        xScaleFocus.domain(selection.map(xScaleContext.invert, xScaleContext));
      } else {
        xScaleFocus.domain(xScaleContext.domain());
      }
      updateTimeline();
    }

    const defaultBrushW = width * 0.34;
    const defaultBrushStart = Math.max(0, (width - defaultBrushW) / 2);

    const brush = d3.brushX()
      .extent([[0, 0], [width, contextStripHeight]])
      .handleSize(0)
      .on("brush", (event) => { if (event.selection) brushed(event.selection); })
      .on("end", (event) => { if (!event.selection) brushed(null); });

    brushG.call(brush).call(brush.move, [0, width]);

    document.getElementById("timeline-reset-range").addEventListener("click", () => {
      popup.classList.add("hidden");
      brushG.call(brush.move, [0, width]);
    });

    document.getElementById("timeline-initial-window").addEventListener("click", () => {
      popup.classList.add("hidden");
      brushG.call(brush.move, [defaultBrushStart, defaultBrushStart + defaultBrushW]);
    });

    const [sizeGroup, locationGroup, techniqueGroup] = groups;

    function commitAppliedFiltersFromForm() {
      appliedFilters.size = sizeGroup.select.value;
      appliedFilters.location = locationGroup.select.value;
      appliedFilters.technique = techniqueGroup.select.value;
      appliedSearch = searchInput.value;
    }

    function applyFilterForm() {
      commitAppliedFiltersFromForm();
      popup.classList.add("hidden");
      updateTimeline();
    }

    function resetFilterForm() {
      appliedFilters.size = "All";
      appliedFilters.location = "All";
      appliedFilters.technique = "All";
      appliedSearch = "";
      sizeGroup.select.value = "All";
      locationGroup.select.value = "All";
      techniqueGroup.select.value = "All";
      searchInput.value = "";
      popup.classList.add("hidden");
      updateTimeline();
    }

    applyFiltersButton.addEventListener("click", applyFilterForm);
    resetFiltersButton.addEventListener("click", resetFilterForm);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); applyFilterForm(); }
    });

    updateTimeline();
  })

  .catch((error) => {
    container.append("p").style("color", "#b00020")
      .text(`Failed to load data: ${error.message}`);
  });
