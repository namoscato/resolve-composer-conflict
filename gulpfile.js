'use strict';

const gulp = require('gulp');
const eslint = require('gulp-eslint');
const typescript = require('gulp-typescript');

const js = {
    src: 'src/**/*.ts',
    dest: 'bin',
};

const tsProject = typescript.createProject('tsconfig.json');

function jsApp() {
    return tsProject.src()
        .pipe(tsProject())
        .js.pipe(gulp.dest(js.dest));
}

function jsLint() {
    return gulp.src(js.src)
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError());
}

const all = jsApp;

function watch() {
    gulp.watch(js.src, all);
}

exports.all = all;
exports.default = gulp.series(all, watch);
exports.jsApp = jsApp;
exports.jsLint = jsLint;
exports.watch = watch;
