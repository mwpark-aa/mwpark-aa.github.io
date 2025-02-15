#!/bin/bash

# deploy.sh

# 설정
BUILD_DIR="build"
TEMP_DIR=".gh-pages-temp"
BRANCH="gh-pages"
REPO_URL=$(git config --get remote.origin.url)

# 빌드 실행
echo "install npm..."
npm install

# 빌드 실행
echo "Running build..."
npm run build

# 임시 디렉토리 생성 및 이동
echo "Preparing for deployment..."
rm -rf $TEMP_DIR
mkdir $TEMP_DIR
cd $TEMP_DIR

# Git 초기화
git init
git checkout -b $BRANCH

# 빌드 파일 복사
echo "Copying build files..."
cp -r ../$BUILD_DIR/* .

# Git에 파일 추가
echo "Adding files to Git..."
git add .

# Commit
echo "Committing changes..."
git commit -m "Deploy to GitHub Pages"

# GitHub Pages에 푸시
echo "Pushing to GitHub Pages..."
git push --force $REPO_URL $BRANCH

# 정리
cd ..
rm -rf $TEMP_DIR

echo "Deployment completed!"
