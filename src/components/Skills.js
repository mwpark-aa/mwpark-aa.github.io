import React from "react";
import {Box, Chip, Container, Paper, Typography} from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import ChatIcon from '@mui/icons-material/Chat';

const categoryIcons = {
    Backend: <CodeIcon sx={{color: "primary.main"}}/>,
    DevOps: <CloudUploadIcon sx={{color: "success.main"}}/>,
    Frontend: <DesktopWindowsIcon sx={{color: "secondary.main"}}/>,
    Communication: <ChatIcon sx={{color: "warning.main"}}/>,
};

const Skills = ({skills, categoryColors, onClick}) => {
    const renderSkillCategory = (category, skillList) => (
        <Paper
            elevation={4}
            sx={{
                p: 4,
                mb: 3,
                borderRadius: 3,
                backgroundColor: "background.paper",
                transition: "all 0.3s ease",
                "&:hover": {boxShadow: 6},
            }}
        >
            <Box sx={{display: "flex", alignItems: "center", mb: 2}}>
                {categoryIcons[category]}
                <Typography variant="h6" sx={{ml: 1, fontWeight: 600}}>
                    {category}
                </Typography>
            </Box>
            <Box sx={{display: "flex", flexWrap: "wrap", gap: 1}}>
                {skillList.map((skill, index) => (
                    <Chip
                        key={index}
                        label={skill}
                        color={categoryColors[category]}
                        onClick={() => onClick(skill, categoryColors[category])}
                        size="medium"
                        sx={{
                            cursor: "pointer",
                            transition: "all 0.3s ease",
                            "&:hover": {
                                backgroundColor: `${categoryColors[category]}.dark`,
                                transform: "translateY(-2px)",
                                boxShadow: 3,
                            },
                        }}
                    />
                ))}
            </Box>
        </Paper>
    );

    return (
        <Container maxWidth="md" sx={{mt: 4}}>
            {Object.entries(skills).map(([category, skillList]) =>
                renderSkillCategory(category.charAt(0).toUpperCase() + category.slice(1), skillList)
            )}
        </Container>
    );
};

export default Skills;
