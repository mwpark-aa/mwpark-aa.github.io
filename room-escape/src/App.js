import React, { useState } from 'react';
import {
  TextField,
  Button,
  Box,
  Typography,
  Chip,
  Container
} from '@mui/material';

const EscapeRoomForm = ({ index }) => {
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

  const handleDeleteTime = (timeToDelete) => {
    setPreferredTimes(preferredTimes.filter(time => time !== timeToDelete));
  };

  return (
      <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid #ccc', padding: 2, borderRadius: 2 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          방탈출 예약 정보 #{index + 1}
        </Typography>

        <TextField
            label="방탈출 이름"
            variant="outlined"
            fullWidth
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
        />

        <TextField
            label="소요 시간 (분)"
            variant="outlined"
            fullWidth
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
        />

        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
              label="예약 시간 후보 ( ex 13:30 )"
              variant="outlined"
              fullWidth
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
          />
          <Button variant="contained" onClick={handleAddTime}>
            추가
          </Button>
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
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

export default function MultiEscapeRoomForm() {
  const [formCount, setFormCount] = useState(1);

  return (
      <Container maxWidth="md">
        <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            방탈출 예약 시스템
          </Typography>

          <TextField
              label="연방 개수 (최대 5)"
              variant="outlined"
              type="number"
              value={Number(formCount)}
              onChange={(e) => setFormCount(Math.min(parseInt(e.target.value || 0), 5))}
              sx={{ mb: 2 }}
          />

          {[...Array(formCount)].map((_, index) => (
              <EscapeRoomForm key={index} index={index} />
          ))}

          <Button variant="contained" color="primary" sx={{ mt: 2 }}>
            전체 예약하기
          </Button>
        </Box>
      </Container>
  );
}
