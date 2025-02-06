import React, {useEffect, useState} from 'react';
import {
    Box,
    Button,
    Container,
    TextField,
    Typography
} from '@mui/material';
import dayjs from "dayjs";
import CustomTable from "./Table";
import EscapeRoomForm from "./RoomForm";


export default function MultiEscapeRoomForm() {
    const [formCount, setFormCount] = useState(1);
    const [timeRange, setTimeRange] = useState(10);
    const [startTime, setStartTime] = useState(null);
    const [endTime, setEndTime] = useState(null);
    const [savedThemeInfo, setSavedThemeInfo] = useState({});
    const [allComb, setAllComb] = useState([]);


    function findNonOverlappingCombinations(intervals) {
        // Group intervals by name
        const intervalsByName = {};
        intervals.forEach(interval => {
            if (!intervalsByName[interval.name]) {
                intervalsByName[interval.name] = [];
            }
            intervalsByName[interval.name].push(interval);
        });

        // Convert grouped intervals to array of name groups
        const nameGroups = Object.values(intervalsByName);

        // Recursive function to generate combinations
        function generateCombinations(currentCombination, remainingGroups) {
            if (remainingGroups.length === 0) {
                return [currentCombination];
            }

            const combinations = [];
            const currentGroup = remainingGroups[0];

            for (let j = 0; j < currentGroup.length; j++) {
                const currentInterval = currentGroup[j];

                const isOverlapping = currentCombination.some(interval =>
                    (currentInterval.startTime < interval.endTime.add(timeRange, 'minutes') &&
                        currentInterval.endTime.add(timeRange, 'minutes') > interval.startTime)
                );

                if (!isOverlapping) {
                    const newCombination = [...currentCombination, currentInterval];
                    const newRemainingGroups = remainingGroups.slice(1);

                    combinations.push(...generateCombinations(newCombination, newRemainingGroups));
                }
            }

            return combinations;
        }

        const allCombinations = generateCombinations([], nameGroups);

        const validCombinations = allCombinations.filter(combo => combo.length === nameGroups.length);

        // Sort each combination by startTime
        const sortedCombinations = validCombinations.map(combo =>
            combo.sort((a, b) => a.startTime.diff(b.startTime))
        );

        // Sort all combinations based on the earliest startTime in each combination
        sortedCombinations.sort((comboA, comboB) =>
            comboA[0].startTime.diff(comboB[0].startTime)
        );

        // Remove duplicates
        return Array.from(new Set(sortedCombinations.map(JSON.stringify)), JSON.parse);
    }

    const updateSavedThemeInfo = (index, themeInfo) => {
        setSavedThemeInfo(prevState => ({
            ...prevState,
            [index]: {
                ...prevState[index],
                ...themeInfo
            }
        }));
    };

    const onClickButton = () => {
        const currentDate = dayjs().format('YYYY-MM-DD')
        let all_case = []

        for (let i = 0; i < formCount; i++) {
            const tmp = savedThemeInfo[i]
            const timeCase = tmp['preferredTimes']

            for (let j = 0; j < timeCase.length; j++) {
                const dateTimeString = `${currentDate} ${timeCase[j]}`
                const dict = {
                    name: tmp['roomName'],
                    startTime: dayjs(dateTimeString, "YYYY-MM-DD HH:mm"),
                    endTime: dayjs(dateTimeString, "YYYY-MM-DD HH:mm").add(Number(tmp['duration']), "minute"),
                }

                all_case.push(dict)
            }
        }

        const test = findNonOverlappingCombinations(all_case)

        setAllComb(test)
    }

    return (
        <Container maxWidth="sm">
            <Box sx={{mt: 4, display: 'flex', flexDirection: 'column', gap: 2}}>
                <Typography variant="h4" component="h1" gutterBottom>
                    방탈출 연방 계획 도우미
                </Typography>

                <TextField
                    label="연방 개수 (최대 5)"
                    variant="outlined"
                    type="text"
                    value={Number(formCount)}
                    onChange={(e) => setFormCount(Math.min(parseInt(e.target.value || 0), 5))}
                    sx={{mb: 2}}
                />

                <TextField
                    label="테마 당 시간 간격 (분)"
                    variant="outlined"
                    type="text"
                    value={Number(timeRange)}
                    onChange={(e) => setTimeRange(e.target.value)}
                    sx={{mb: 2}}
                />

                <Box sx={{display: 'flex', flexDirection: 'row', gap: 2}}>
                    <TextField
                        fullWidth
                        label="테마 시작시간 (난 이때 못일어난다!)"
                        variant="outlined"
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        InputLabelProps={{shrink: true}}
                    />
                    <TextField
                        fullWidth
                        label="테마 끝시간 (난 이이상 늦어지면 안된다!)"
                        variant="outlined"
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        InputLabelProps={{shrink: true}}
                    />
                </Box>

                {[...Array(formCount)].map((_, index) => (
                    <EscapeRoomForm key={index} index={index} updateInfo={updateSavedThemeInfo}/>
                ))}

                <Button variant="contained" color="primary" sx={{mt: 2}} onClick={onClickButton}>
                    일정 만들어보기
                </Button>

                <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 1}}>
                    <CustomTable data={allComb}/>
                </Box>
            </Box>
        </Container>
    );
}
