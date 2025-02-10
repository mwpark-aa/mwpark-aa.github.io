import React from "react";
import { Container, Grid, Card, CardContent, Typography } from "@mui/material";

const projects = [
    { title: "GitHub Pages 포트폴리오", description: "React와 Material-UI로 제작한 포트폴리오 사이트" },
    { title: "To-Do App", description: "React Hooks와 Firebase를 활용한 할 일 관리 앱" },
];

const Projects = () => {
    return (
        <Container sx={{ mt: 4 }}>
            <Typography variant="h4" gutterBottom>📌 프로젝트 목록</Typography>
            <Grid container spacing={3}>
                {projects.map((project, index) => (
                    <Grid item xs={12} sm={6} md={4} key={index}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6">{project.title}</Typography>
                                <Typography>{project.description}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Container>
    );
};

export default Projects;