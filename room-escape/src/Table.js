import React from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography } from '@mui/material';
import dayjs from 'dayjs';

const CustomTable = ({ data }) => {
    return (
        <TableContainer component={Paper}>
            <Typography variant="h6" gutterBottom component="div" sx={{ p: 2 }}>
                가능한 일정 조합
            </Typography>
            <Table sx={{ minWidth: 650 }} aria-label="schedule table">
                <TableHead>
                    <TableRow>
                        <TableCell>조합</TableCell>
                        <TableCell>테마 이름</TableCell>
                        <TableCell align="right">시작 시간</TableCell>
                        <TableCell align="right">종료 시간</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {data.map((combination, combinationIndex) => (
                        <React.Fragment key={combinationIndex}>
                            {combination.map((schedule, scheduleIndex) => (
                                <TableRow key={`${combinationIndex}-${scheduleIndex}`}>
                                    {scheduleIndex === 0 && (
                                        <TableCell rowSpan={combination.length}>
                                            조합 {combinationIndex + 1}
                                        </TableCell>
                                    )}
                                    <TableCell component="th" scope="row">
                                        {schedule.name}
                                    </TableCell>
                                    <TableCell align="right">{dayjs(schedule.startTime).format('HH:mm')}</TableCell>
                                    <TableCell align="right">{dayjs(schedule.endTime).format('HH:mm')}</TableCell>
                                </TableRow>
                            ))}
                        </React.Fragment>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

export default CustomTable;
