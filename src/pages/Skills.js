import React from "react";
import { Container, Typography, Chip, Box } from "@mui/material";

const skills = ["React", "JavaScript", "Material-UI", "Firebase", "Node.js", "Git", "TypeScript"];

const Skills = () => {
    return (
        <Container sx={{ mt: 4 }}>
            <Typography variant="h4" gutterBottom>💡 기술 스택</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {skills.map((skill, index) => (
                    <Chip key={index} label={skill} color="primary" />
                ))}
            </Box>
        </Container>
    );
};

export default Skills;