'use strict';

const gulp = require('gulp');
const gulpTslint = require('gulp-tslint');
const gulpTypescript = require('gulp-typescript');

const js = {
    src: 'src/**/*.ts',
    dest: 'bin',
};

const tsProject = gulpTypescript.createProject('tsconfig.json');

function jsApp() {
    return tsProject.src()
        .pipe(tsProject())
        .js.pipe(gulp.dest(js.dest));
}

function jsLint() {
    return tsProject.src()
        .pipe(gulpTslint({
            formatter: "verbose"
        }))
        .pipe(gulpTslint.report());
}

const all = gulp.parallel(jsApp, jsLint);

function watch() {
    gulp.watch(js.src, all);
}

exports.all = all;
exports.default = gulp.parallel(all, watch);
exports.watch = watch;
