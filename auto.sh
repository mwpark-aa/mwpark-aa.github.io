#!/bin/bash

# 프로젝트 빌드
echo "프로젝트 빌드 중..."
npm run build

# 빌드 폴더 이름
BUILD_FOLDER="build"

# 임시 폴더 생성
TEMP_FOLDER=$(mktemp -d)

# 현재 브랜치 이름 저장
CURRENT_BRANCH=$(git branch --show-current)

# build 폴더의 내용을 임시 폴더로 복사
cp -R $BUILD_FOLDER/* $TEMP_FOLDER

# gh-pages 브랜치로 전환 (없으면 생성)
git checkout --orphan gh-pages

# 기존 파일 삭제 (숨김 파일 포함)
git rm -rf .

# 임시 폴더의 내용을 현재 디렉토리로 복사
cp -R $TEMP_FOLDER/* .

# 모든 파일을 스테이징
git add -A

# 변경사항 커밋
git commit -m "Deploy to GitHub Pages"

# gh-pages 브랜치를 원격 저장소로 강제 푸시
git push origin gh-pages --force

# 원래 브랜치로 돌아가기
git checkout $CURRENT_BRANCH

# 임시 폴더 삭제
rm -rf $TEMP_FOLDER

echo "배포가 완료되었습니다."
