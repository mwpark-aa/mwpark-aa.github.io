#!/bin/bash

echo "NPM INSTALL"
npm install

# 프로젝트 빌드
echo "프로젝트 빌드 중..."
npm run build

# 빌드 폴더 이름
BUILD_FOLDER="build"

# 현재 브랜치 이름 저장
CURRENT_BRANCH=$(git branch --show-current)

# 현재 작업 디렉토리 저장
CURRENT_DIR=$(pwd)

# 임시 디렉토리 생성 및 이동
TEMP_DIR=$(mktemp -d)
cp -R $BUILD_FOLDER/* $TEMP_DIR
cd $TEMP_DIR

# gh-pages 브랜치 생성 또는 업데이트
if git show-ref --quiet refs/heads/gh-pages; then
    git checkout gh-pages
    git rm -rf .
else
    git checkout --orphan gh-pages
    git rm -rf .
fi

# 빌드 결과물 복사 및 커밋
cp -R $CURRENT_DIR/$BUILD_FOLDER/* .
git add .
git commit -m "github page 배포"

# gh-pages 브랜치를 원격 저장소로 강제 푸시
git push origin gh-pages --force

# 원래 디렉토리와 브랜치로 돌아가기
cd $CURRENT_DIR
git checkout $CURRENT_BRANCH

# 임시 디렉토리 삭제
rm -rf $TEMP_DIR

echo "배포가 완료되었습니다."
