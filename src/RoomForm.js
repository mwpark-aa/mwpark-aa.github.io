import React, {useEffect, useState} from "react";
import {Box, Button, Chip, TextField, Typography} from "@mui/material";

const EscapeRoomForm = ({index, updateInfo}) => {
    const [roomName, setRoomName] = useState('');
    const [duration, setDuration] = useState('');
    const [preferredTime, setPreferredTime] = useState('');
    const [preferredTimes, setPreferredTimes] = useState([]);

    const handleAddTime = () => {
        if (preferredTime && !preferredTimes.includes(preferredTime)) {
            setPreferredTimes([...preferredTimes, preferredTime]);
            setPreferredTime('');
        }
    };
    const [error, setError] = useState(false);

    const validateTimeFormat = (time) => {
        const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        return regex.test(time);
    };

    const handleTimeChange = (e) => {
        const inputTime = e.target.value;
        setPreferredTime(inputTime);

        if (inputTime === '' || validateTimeFormat(inputTime)) {
            setError(false);
        } else {
            setError(true);
        }
    };

    const handleDeleteTime = (timeToDelete) => {
        setPreferredTimes(preferredTimes.filter(time => time !== timeToDelete));
    };

    useEffect(() => {
        const val = {
            roomName: roomName,
            duration: duration,
            preferredTimes: preferredTimes,
        }
        updateInfo(index, val)
    }, [roomName, duration, preferredTimes, index]);

    return (
        <Box sx={{
            mt: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            border: '1px solid #ccc',
            padding: 2,
            borderRadius: 2
        }}>
            <Typography variant="h5" component="h2" gutterBottom>
                방탈출 예약 정보 #{index + 1}
            </Typography>

            <TextField
                label="테마 이름 (구분만 가능하게)"
                variant="outlined"
                fullWidth
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
            />

            <TextField
                label="테마 시간 (분)"
                variant="outlined"
                fullWidth
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
            />

            <Box sx={{display: 'flex', gap: 1}}>
                <TextField
                    fullWidth
                    label="예약 시간 후보 ( ex 13:30 )"
                    variant="outlined"
                    type="text"
                    value={preferredTime}
                    onChange={handleTimeChange}
                    error={error}
                    helperText={error ? "올바른 시간 형식을 입력해주세요 (HH:MM)" : ""}
                />
                <Button variant="contained" onClick={handleAddTime}>
                    추가
                </Button>
            </Box>

            <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 1}}>
                {preferredTimes.map((time, index) => (
                    <Chip
                        key={index}
                        label={time}
                        onDelete={() => handleDeleteTime(time)}
                    />
                ))}
            </Box>
        </Box>
    );
};

export default EscapeRoomForm