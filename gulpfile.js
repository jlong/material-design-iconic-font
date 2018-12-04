var gulp = require("gulp")
var change = require("gulp-change")
var concat = require("gulp-concat")
var shell = require("gulp-shell")
var svgmin = require("gulp-svgmin")
var raster = require("gulp-raster")
var rename = require("gulp-rename")
var sort = require("gulp-sort")
var zip = require("gulp-zip")
var runSequence = require("run-sequence")
var fs = require('fs')
var _ = require('lodash')

var config = {
  glob: '**/*.svg',
  src: 'src/2.2',
  optimized: 'svgs',
  pngs: 'pngs',
  dist: 'dist',
  javascript: './',
  bundle: './material-ionic.js',
  zip: 'material-ionic-icons.zip',
  preview: './preview.svg',
  svgmin: {
    plugins: [{'removeTitle': true}]
  }
}

var prequel = "(function() {\r\n" +
              "var MaterialIonicIcons = {\r\n"
var sequel  = "\r\n" +
              "}\r\n" +
              "MaterialIonicIcons.all = function() {\r\n" +
              "  var icons = []\r\n" +
              "  for (name in MaterialIonicIcons) {\r\n" +
              "    if (MaterialIonicIcons.hasOwnProperty(name) && typeof MaterialIonicIcons[name] !== 'function') {\r\n" +
              "      icons.push(MaterialIonicIcons[name])\r\n" +
              "    }\r\n" +
              "  }\r\n" +
              "  return icons\r\n" +
              "}\r\n" +
              "if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {\r\n" +
              "  module.exports = MaterialIonicIcons\r\n" +
              "} else {\r\n" +
              "  window.MaterialIonicIcons = MaterialIonicIcons\r\n" +
              "}\r\n" +
              "})();"

gulp.task('clean-optimized', shell.task('rm -Rf ' + config.optimized + '/*'))
gulp.task('clean-javascript', shell.task('rm -Rf ' + config.bundle))
gulp.task('clean-pngs', shell.task('rm -Rf ' + config.pngs))

gulp.task('clean', ['clean-optimized', 'clean-javascript'])

gulp.task('optimize', ['clean-optimized'], function() {
  return gulp.src(config.src + '/' + config.glob)
    .pipe(svgmin(config.svgmin))
    .pipe(gulp.dest(config.optimized))
})

gulp.task('javascript', ['clean-javascript', 'optimize'], function() {
  var categories = require('./data/categories')
  var icons = require('./data/icons')
  var titlecase = function(string) {
    var words = string.split(/-|\s/)
    for (var i = 0; i < words.length; i++) {
      var word = words[i]
      if (i > 0 && ['a', 'an', 'the', 'of', 'and'].includes(word)) { continue }
      words[i] = word.charAt(0).toUpperCase() + word.slice(1)
    }
    return words.join(" ")
  }
  var extractName = function(slug, lookup) {
    var object = lookup[slug]
    if (object && 'name' in object) { return object['name'] }
    return titlecase(slug)
  }
  var prettyPrint = function(object) {
    result = []
    for (key in object) {
      if (object.hasOwnProperty(key)) {
        var value = object[key]
        var valueString = Array.isArray(value) ? "['" + value.join("', '") + "']" : JSON.stringify(value)
        if (valueString === "['']") { valueString = '[]' }
        result.push(
          key + ': ' +
          valueString
        )
      }
    }
    return '{ ' + result.join(', ') + ' }'
  }
  return gulp.src([
      config.optimized + '/' + config.glob,
      '!' + config.optimized + '/12 - social/*',
      '!' + config.optimized + '/18 - new brands in 2.2/*'
    ])
    .pipe(sort())
    .pipe(change(function(content) {
      /<svg.*?>([.]*)<\/svg>/g.test(content)
      var paths = content
            .replace(/<svg.*?>/g, '')
            .replace(/ fill="[^"]*"/g, '')
            .replace(/<def>.*?<\/def>/g, '')           // def and clipPath
            .replace(/<clipPath.*?<\/clipPath>/g, '')
            .replace(/<\/svg>/g, '')
            .trim()
      var parts = this.fname.split("/")
      var folder = parts[0]
      var category = extractName(folder.replace(/^\d+ - /, ''), categories)
      var slug = parts[1].replace(/\.svg$/, '')
      var name = extractName(slug, icons) 
      var categoryKeywords = categories[parts[0]] ? categories[parts[0]].keywords || [] : []
      var iconKeywords = icons[slug] ? icons[slug].keywords || [] : []
      var keywords = [].concat(categoryKeywords).concat(iconKeywords)
      var object = {
        name: name,
        category: category,
        paths: paths,
      }
      if (keywords.length) { object.keywords = keywords }
      return "  '" + slug + "': " + prettyPrint(object)
    }))
    .pipe(concat(config.bundle, {newLine: ",\r\n"}))
    .pipe(change(function(content) {
      return prequel + content + sequel
    }))
    .pipe(gulp.dest(config.javascript))
})

gulp.task('preview-svg', ['javascript'], function(done) {
  var MaterialIonicIcons = require(config.bundle)
  var svg = []
  var row = 1
  var col = 1
  var maxCol = 41
  var category = null
  var icons = _.sortBy(MaterialIonicIcons.all(), 'category', 'name')
  icons.forEach(function(icon) {
    if (category !== icon.category) {
      category = icon.category
      row += col === 1 ? 1 : 3
      svg.push('<text x="24" y="' + row * 24 + '" style="font-size:12px;font-family:sans-serif">' + category + '</text>')
      row += 1
      col = 1
    }
    svg.push('<g id="Icons/Material Ionic/' + icon.category + '/' + icon.name + '" transform="translate(' + 24 * col + ', ' + 24 * row + ')"><rect x="0" y="0" width="24" height="24" fill="#e5e5e5" />' + icon.paths + '</g>')
    col += 2
    if (col >= maxCol) {
      row += 2
      col = 1
    }
  })
  var width = 24 * maxCol
  var height = 24 * (row + 2)
  svg.unshift('<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="#f5f5f5" />')
  svg.unshift('<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height +'" xmlns="http://www.w3.org/2000/svg">')
  svg.push('</svg>')
  fs.writeFile(config.preview, svg.join("\r\n"), done)
})

gulp.task('preview-png', ['preview-svg'], function() {
  return gulp.src(config.preview)
    .pipe(raster({scale: 2}))
    .pipe(rename({extname: '.png'}))
    .pipe(gulp.dest('./'))
})

gulp.task('preview', ['preview-svg', 'preview-png'])

gulp.task('pngs@1x', function() {
  return gulp.src(config.src + '/' + config.glob)
    .pipe(raster())
    .pipe(rename({extname: '.png'}))
    .pipe(gulp.dest(config.pngs))
})

gulp.task('pngs@2x', function() {
  return gulp.src(config.src + '/' + config.glob)
    .pipe(raster({scale: 2}))
    .pipe(rename({suffix: '@2x', extname: '.png'}))
    .pipe(gulp.dest(config.pngs))
})

gulp.task('pngs', ['clean-pngs'], function(done) {
  runSequence('pngs@1x', 'pngs@2x', done)
})

gulp.task('release', function() {
  return gulp.src([
      config.optimized + '/' + config.glob,
      config.pngs + '/**/*.png',
      config.bundle,
      'LICENSE.md'
    ])
    .pipe(zip(config.zip))
    .pipe(gulp.dest(config.dist))
})
